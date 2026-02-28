"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { db, storage } from '@/lib/firebase/config';
import {
  collection, query, onSnapshot, doc, updateDoc,
  addDoc, deleteDoc, writeBatch, getDocs, orderBy, limit, Timestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { StandaloneReceipt } from '@/types/Receipt';
import { format, addMonths, subMonths, isSameMonth } from 'date-fns';
import Link from 'next/link';

type SortMode = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc';

export default function ReceiptsPage() {
  const { user, loading: authLoading } = useAuth();
  const [allReceipts, setAllReceipts] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // UI states
  const [renamingReceiptId, setRenamingReceiptId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchAmountMin, setSearchAmountMin] = useState('');
  const [searchAmountMax, setSearchAmountMax] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Standalone receipt state
  const [standaloneReceipts, setStandaloneReceipts] = useState<StandaloneReceipt[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [linkingReceiptId, setLinkingReceiptId] = useState<string | null>(null);
  const [linkModalExpenses, setLinkModalExpenses] = useState<Expense[]>([]);
  const [linkModalLoading, setLinkModalLoading] = useState(false);
  const [linkModalSearch, setLinkModalSearch] = useState('');
  const [linkModalDateFrom, setLinkModalDateFrom] = useState('');
  const [linkModalDateTo, setLinkModalDateTo] = useState('');
  const [deletingStandaloneId, setDeletingStandaloneId] = useState<string | null>(null);
  const [renamingStandaloneId, setRenamingStandaloneId] = useState<string | null>(null);
  const [renameStandaloneValue, setRenameStandaloneValue] = useState('');

  // Multi-select state
  const [selectedStandaloneIds, setSelectedStandaloneIds] = useState<Set<string>>(new Set());
  const [selectedExistingIds, setSelectedExistingIds] = useState<Set<string>>(new Set());
  const [bulkDateInput, setBulkDateInput] = useState('');
  const [showBulkDatePicker, setShowBulkDatePicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }

    const unsubReceipts = onSnapshot(
      query(collection(db, 'users', user.uid, 'expenses')),
      (snapshot) => {
        const expensesWithReceipts = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Expense))
          .filter(e => e.receiptUrl && e.receiptUrl.trim() !== '');
        setAllReceipts(expensesWithReceipts);
        setLoading(false);
      }
    );

    const unsubStandalone = onSnapshot(
      query(collection(db, 'users', user.uid, 'receipts')),
      (snapshot) => {
        setStandaloneReceipts(snapshot.docs.map(d => {
          const data = d.data();
          // Backward compatibility: convert old single linkedExpenseId to array
          const linkedExpenseIds: string[] = data.linkedExpenseIds ??
            (data.linkedExpenseId ? [data.linkedExpenseId] : []);
          return { id: d.id, ...data, linkedExpenseIds } as StandaloneReceipt;
        }));
      }
    );

    return () => { unsubReceipts(); unsubStandalone(); };
  }, [user, authLoading]);

  // Receipts for the current month, sorted
  const currentReceipts = useMemo(() => {
    const filtered = allReceipts.filter(e =>
      isSameMonth(e.date.toDate(), currentMonth)
    );
    switch (sortMode) {
      case 'date_desc':   return [...filtered].sort((a, b) => b.date.toMillis() - a.date.toMillis());
      case 'date_asc':    return [...filtered].sort((a, b) => a.date.toMillis() - b.date.toMillis());
      case 'amount_desc': return [...filtered].sort((a, b) => b.amount - a.amount);
      case 'amount_asc':  return [...filtered].sort((a, b) => a.amount - b.amount);
      case 'name_asc':    return [...filtered].sort((a, b) =>
        (a.receiptName || a.store || '').localeCompare(b.receiptName || b.store || '', 'ja'));
      default:            return [...filtered].sort((a, b) => b.date.toMillis() - a.date.toMillis());
    }
  }, [allReceipts, sortMode, currentMonth]);

  /** Map of expenseId → Expense for quick lookup in linked receipt cards. */
  const expenseById = useMemo(() => {
    const map = new Map<string, Expense>();
    allReceipts.forEach(e => map.set(e.id, e));
    return map;
  }, [allReceipts]);

  /** Returns the date to use for a standalone receipt's month bucket. */
  const getStandaloneDisplayDate = (r: StandaloneReceipt): Date =>
    r.displayDate ? r.displayDate.toDate() : r.uploadedAt.toDate();

  // Search helpers
  const isSearchActive = searchText.trim() !== '' || searchAmountMin !== '' || searchAmountMax !== '' || searchDateFrom !== '' || searchDateTo !== '';

  const searchResults = useMemo(() => {
    if (!isSearchActive) return [];
    return allReceipts.filter(e => {
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const haystack = [e.receiptName, e.store, e.memo].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (searchAmountMin !== '' && e.amount < Number(searchAmountMin)) return false;
      if (searchAmountMax !== '' && e.amount > Number(searchAmountMax)) return false;
      if (searchDateFrom) {
        const from = new Date(searchDateFrom);
        if (e.date.toDate() < from) return false;
      }
      if (searchDateTo) {
        const to = new Date(searchDateTo);
        to.setHours(23, 59, 59, 999);
        if (e.date.toDate() > to) return false;
      }
      return true;
    }).sort((a, b) => b.date.toMillis() - a.date.toMillis());
  }, [isSearchActive, allReceipts, searchText, searchAmountMin, searchAmountMax, searchDateFrom, searchDateTo]);

  const handleClearSearch = () => {
    setSearchText('');
    setSearchAmountMin('');
    setSearchAmountMax('');
    setSearchDateFrom('');
    setSearchDateTo('');
  };

  const handleRenameReceipt = async (expenseId: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'expenses', expenseId), {
      receiptName: renameValue.trim() || null,
    });
    setRenamingReceiptId(null);
  };

  const handleRemoveReceipt = async (expenseId: string) => {
    if (!user || !confirm('このレシート画像の添付を解除しますか？（支出の記録は残ります）')) return;
    setRemovingId(expenseId);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'expenses', expenseId), { receiptUrl: '' });
    } catch {
      alert('削除に失敗しました。');
    } finally {
      setRemovingId(null);
    }
  };

  // ── Standalone receipt handlers ────────────────────────────

  /** Recursively collect all files from a dropped FileSystemEntry (file or folder). */
  const collectFiles = (entry: FileSystemEntry): Promise<File[]> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file(
          (f) => resolve([f]),
          () => resolve([])
        );
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const allFiles: File[] = [];
        const readAll = () => {
          reader.readEntries(async (entries) => {
            if (entries.length === 0) { resolve(allFiles); return; }
            const nested = await Promise.all(entries.map((e) => collectFiles(e)));
            nested.forEach((f) => allFiles.push(...f));
            readAll(); // readEntries may return partial batches
          }, () => resolve(allFiles));
        };
        readAll();
      } else {
        resolve([]);
      }
    });

  /** Upload multiple files sequentially, showing progress. */
  const handleFilesUpload = async (files: File[]) => {
    if (!user) return;
    const accepted = files.filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (accepted.length === 0) return;
    setUploadProgress({ done: 0, total: accepted.length });
    let done = 0;
    for (const file of accepted) {
      try {
        const path = `receipts/${user.uid}/standalone/${Date.now()}_${file.name}`;
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, file);
        const fileUrl = await getDownloadURL(sRef);
        await addDoc(collection(db, 'users', user.uid, 'receipts'), {
          fileUrl,
          fileName: file.name,
          fileType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          storagePath: path,
          uploadedAt: Timestamp.now(),
          linkedExpenseId: null,
        });
        done++;
        setUploadProgress({ done, total: accepted.length });
      } catch (e) {
        console.error(e);
      }
    }
    setUploadProgress(null);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);
    if (entries.length === 0) {
      // Fallback for browsers without File System API
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFilesUpload(files);
      return;
    }
    const allFiles: File[] = [];
    const nested = await Promise.all(entries.map((entry) => collectFiles(entry)));
    nested.forEach((f) => allFiles.push(...f));
    if (allFiles.length > 0) handleFilesUpload(allFiles);
  };

  const openLinkModal = async (receiptId: string) => {
    if (!user) return;
    setLinkingReceiptId(receiptId);
    setLinkModalLoading(true);
    setLinkModalSearch('');
    setLinkModalDateFrom('');
    setLinkModalDateTo('');
    try {
      const snap = await getDocs(
        query(collection(db, 'users', user.uid, 'expenses'), orderBy('date', 'desc'), limit(200))
      );
      setLinkModalExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    } catch (e) {
      console.error(e);
    } finally {
      setLinkModalLoading(false);
    }
  };

  const handleLinkReceipt = async (expenseId: string) => {
    if (!user || !linkingReceiptId) return;
    const receipt = standaloneReceipts.find(r => r.id === linkingReceiptId);
    const expense = linkModalExpenses.find(e => e.id === expenseId);
    if (!receipt || !expense) return;

    // Confirm if already linked to one or more expenses
    if (receipt.linkedExpenseIds.length > 0) {
      if (!confirm(`このファイルはすでに ${receipt.linkedExpenseIds.length} 件の支出に紐付けられています。\n追加で紐付けますか？`)) return;
    }
    // Confirm if target expense already has a different receipt attached
    if (expense.receiptUrl && expense.receiptUrl.trim() !== '' && expense.receiptUrl !== receipt.fileUrl) {
      if (!confirm(`「${expense.store || '(店名なし)'}」には既に別のレシートが添付されています。上書きしますか？`)) return;
    }
    const isFirstLink = receipt.linkedExpenseIds.length === 0;
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'receipts', linkingReceiptId), {
      linkedExpenseIds: arrayUnion(expenseId),
      ...(isFirstLink ? { displayDate: expense.date } : {}),
    });
    batch.update(doc(db, 'users', user.uid, 'expenses', expenseId), {
      receiptUrl: receipt.fileUrl,
      receiptName: receipt.fileName,
    });
    await batch.commit();
    setLinkingReceiptId(null);
  };

  const handleUnlinkReceipt = async (receipt: StandaloneReceipt, expenseId: string) => {
    if (!user) return;
    const newIds = receipt.linkedExpenseIds.filter(id => id !== expenseId);
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'receipts', receipt.id), {
      linkedExpenseIds: arrayRemove(expenseId),
      ...(newIds.length === 0 ? { displayDate: null } : {}),
    });
    batch.update(doc(db, 'users', user.uid, 'expenses', expenseId), { receiptUrl: '' });
    await batch.commit();
  };

  const handleRenameStandalone = async (receiptId: string) => {
    if (!user || !renameStandaloneValue.trim()) return;
    await updateDoc(doc(db, 'users', user.uid, 'receipts', receiptId), {
      fileName: renameStandaloneValue.trim(),
    });
    setRenamingStandaloneId(null);
  };

  const handleDeleteStandaloneReceipt = async (receipt: StandaloneReceipt) => {
    if (!user || !confirm(`「${receipt.fileName}」を削除しますか？`)) return;
    setDeletingStandaloneId(receipt.id);
    try {
      await deleteObject(storageRef(storage, receipt.storagePath));
      if (receipt.linkedExpenseIds.length > 0) {
        const batch = writeBatch(db);
        receipt.linkedExpenseIds.forEach(eid => {
          batch.update(doc(db, 'users', user.uid, 'expenses', eid), { receiptUrl: '' });
        });
        await batch.commit();
      }
      await deleteDoc(doc(db, 'users', user.uid, 'receipts', receipt.id));
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました。');
    } finally {
      setDeletingStandaloneId(null);
    }
  };

  // ── Bulk action handlers ─────────────────────────────────

  const toggleStandaloneSelect = (id: string) => {
    setSelectedStandaloneIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExistingSelect = (id: string) => {
    setSelectedExistingIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearAllSelections = () => {
    setSelectedStandaloneIds(new Set());
    setSelectedExistingIds(new Set());
    setShowBulkDatePicker(false);
  };

  const totalSelected = selectedStandaloneIds.size + selectedExistingIds.size;

  const handleBulkChangeDate = async () => {
    if (!user || !bulkDateInput) return;
    const newTimestamp = Timestamp.fromDate(new Date(bulkDateInput + 'T00:00:00'));
    const batch = writeBatch(db);
    selectedStandaloneIds.forEach(id => {
      batch.update(doc(db, 'users', user.uid, 'receipts', id), { displayDate: newTimestamp });
    });
    selectedExistingIds.forEach(id => {
      batch.update(doc(db, 'users', user.uid, 'expenses', id), { date: newTimestamp });
    });
    await batch.commit();
    clearAllSelections();
    setBulkDateInput('');
  };

  const handleBulkDelete = async () => {
    if (!user || !confirm(`選択した ${totalSelected} 件のレシートを削除しますか？`)) return;
    const batch = writeBatch(db);
    for (const id of Array.from(selectedStandaloneIds)) {
      const r = standaloneReceipts.find(x => x.id === id);
      if (!r) continue;
      try { await deleteObject(storageRef(storage, r.storagePath)); } catch {}
      r.linkedExpenseIds.forEach(eid => {
        batch.update(doc(db, 'users', user.uid, 'expenses', eid), { receiptUrl: '' });
      });
      batch.delete(doc(db, 'users', user.uid, 'receipts', id));
    }
    selectedExistingIds.forEach(id => {
      batch.update(doc(db, 'users', user.uid, 'expenses', id), { receiptUrl: '' });
    });
    await batch.commit();
    clearAllSelections();
  };

  const handleBulkUnlink = async () => {
    if (!user) return;
    const toUnlink = standaloneReceipts.filter(r => selectedStandaloneIds.has(r.id) && r.linkedExpenseIds.length > 0);
    if (toUnlink.length === 0) return;
    const batch = writeBatch(db);
    toUnlink.forEach(r => {
      batch.update(doc(db, 'users', user.uid, 'receipts', r.id), { linkedExpenseIds: [], displayDate: null });
      r.linkedExpenseIds.forEach(eid => {
        batch.update(doc(db, 'users', user.uid, 'expenses', eid), { receiptUrl: '' });
      });
    });
    await batch.commit();
    clearAllSelections();
  };

  // ── Render ────────────────────────────────────────────────

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return <div className="text-center mt-20"><p className="text-xl">ログインしてください</p></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">レシート・領収書一覧</h1>
        <Link
          href="/transactions/expense"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          支出を記録する
        </Link>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
          className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 font-bold py-2 px-4 rounded"
        >
          ◀
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white w-40 text-center">
          {format(currentMonth, 'yyyy年 M月')}
        </h2>
        <button
          onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
          className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 font-bold py-2 px-4 rounded"
        >
          ▶
        </button>
      </div>

      {/* Bulk action bar */}
      {totalSelected > 0 && (
        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-600 rounded-lg flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            {totalSelected} 件選択中
          </span>

          {/* Bulk date change */}
          {showBulkDatePicker ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={bulkDateInput}
                onChange={e => setBulkDateInput(e.target.value)}
                className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              />
              <button
                onClick={handleBulkChangeDate}
                disabled={!bulkDateInput}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded disabled:opacity-40"
              >適用</button>
              <button onClick={() => setShowBulkDatePicker(false)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowBulkDatePicker(true)}
              className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >📅 日付を変更</button>
          )}

          {/* Unlink (only if any linked standalone selected) */}
          {Array.from(selectedStandaloneIds).some(id => standaloneReceipts.find(r => r.id === id)?.linkedExpenseIds.length ?? 0 > 0) && (
            <button
              onClick={handleBulkUnlink}
              className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 text-sm rounded hover:bg-amber-200 dark:hover:bg-amber-900/50"
            >🔗 紐付け解除</button>
          )}

          {/* Delete */}
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 text-sm rounded hover:bg-red-200 dark:hover:bg-red-900/50"
          >🗑 削除</button>

          <button
            onClick={clearAllSelections}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >選択解除</button>
        </div>
      )}

      {/* Upload zone */}
      <div
        className={`mb-5 border-2 border-dashed rounded-lg p-5 transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={handleDrop}
      >
        {/* Hidden file inputs */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesUpload(files); e.target.value = ''; }}
        />
        <input
          type="file"
          ref={folderInputRef}
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesUpload(files); e.target.value = ''; }}
        />

        {uploadProgress ? (
          <div className="text-center py-2">
            <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
              アップロード中… {uploadProgress.done} / {uploadProgress.total} 件
            </p>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center text-sm text-gray-500 dark:text-gray-400">
              {isDragging
                ? <span className="text-indigo-600 dark:text-indigo-400 font-medium">ここにドロップ</span>
                : <span>ファイル・フォルダをここにドラッグ&amp;ドロップ</span>
              }
              <span className="block text-xs mt-0.5 text-gray-400 dark:text-gray-500">対応形式: 画像・PDF　複数同時可</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                📎 ファイルを選択
              </button>
              <button
                type="button"
                onClick={() => {
                  if (folderInputRef.current) {
                    folderInputRef.current.setAttribute('webkitdirectory', '');
                    folderInputRef.current.click();
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                �� フォルダを選択
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unlinked standalone receipts */}
      {standaloneReceipts.filter(r => r.linkedExpenseIds.length === 0 && isSameMonth(getStandaloneDisplayDate(r), currentMonth)).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">未紐付きレシート</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {standaloneReceipts.filter(r => r.linkedExpenseIds.length === 0 && isSameMonth(getStandaloneDisplayDate(r), currentMonth)).map(receipt => (
              <div
                key={receipt.id}
                className={`bg-white dark:bg-black border rounded-lg shadow-sm overflow-hidden flex flex-col transition-all ${selectedStandaloneIds.has(receipt.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                  {/* Checkbox overlay */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStandaloneSelect(receipt.id); }}
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedStandaloneIds.has(receipt.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-400 hover:border-indigo-400'}`}
                  >
                    {selectedStandaloneIds.has(receipt.id) && <span className="text-xs">✓</span>}
                  </button>
                  <a href={receipt.fileUrl} target="_blank" rel="noopener noreferrer">
                    {receipt.fileType === 'application/pdf' || receipt.fileName.toLowerCase().endsWith('.pdf') ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="font-semibold text-sm">PDFファイル</span>
                      </div>
                    ) : (
                      <img src={receipt.fileUrl} alt={receipt.fileName} className="absolute inset-0 w-full h-full object-cover hover:opacity-75 transition-opacity" />
                    )}
                  </a>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {renamingStandaloneId === receipt.id ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={renameStandaloneValue}
                        onChange={(e) => setRenameStandaloneValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameStandalone(receipt.id); if (e.key === 'Escape') setRenamingStandaloneId(null); }}
                        autoFocus
                        placeholder="ファイル名を入力"
                        className="flex-grow px-2 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                      />
                      <button onClick={() => handleRenameStandalone(receipt.id)} className="px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded">保存</button>
                      <button onClick={() => setRenamingStandaloneId(null)} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-xs rounded">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-grow">{receipt.fileName}</span>
                      <button title="名前を変更" onClick={() => { setRenamingStandaloneId(receipt.id); setRenameStandaloneValue(receipt.fileName); }} className="flex-shrink-0 text-sm text-blue-500 hover:text-blue-700">✎</button>
                    </div>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">{format(getStandaloneDisplayDate(receipt), 'yyyy年MM月dd日')}</span>
                  <div className="flex gap-2 pt-1 border-t dark:border-gray-700">
                    <button
                      onClick={() => openLinkModal(receipt.id)}
                      className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded"
                    >支出と紐付け</button>
                    <button
                      onClick={() => handleDeleteStandaloneReceipt(receipt)}
                      disabled={deletingStandaloneId === receipt.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >{deletingStandaloneId === receipt.id ? '削除中...' : '削除'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked standalone receipts */}
      {standaloneReceipts.filter(r => r.linkedExpenseIds.length > 0 && isSameMonth(getStandaloneDisplayDate(r), currentMonth)).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">紐付き済みレシート（アップロード分）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {standaloneReceipts.filter(r => r.linkedExpenseIds.length > 0 && isSameMonth(getStandaloneDisplayDate(r), currentMonth)).map(receipt => (
              <div
                key={receipt.id}
                className={`bg-white dark:bg-black border rounded-lg shadow-sm overflow-hidden flex flex-col transition-all ${selectedStandaloneIds.has(receipt.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                  {/* Checkbox overlay */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStandaloneSelect(receipt.id); }}
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedStandaloneIds.has(receipt.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-400 hover:border-indigo-400'}`}
                  >
                    {selectedStandaloneIds.has(receipt.id) && <span className="text-xs">✓</span>}
                  </button>
                  <a href={receipt.fileUrl} target="_blank" rel="noopener noreferrer">
                    {receipt.fileType === 'application/pdf' || receipt.fileName.toLowerCase().endsWith('.pdf') ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="font-semibold text-sm">PDFファイル</span>
                      </div>
                    ) : (
                      <img src={receipt.fileUrl} alt={receipt.fileName} className="absolute inset-0 w-full h-full object-cover hover:opacity-75 transition-opacity" />
                    )}
                  </a>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {renamingStandaloneId === receipt.id ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={renameStandaloneValue}
                        onChange={(e) => setRenameStandaloneValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameStandalone(receipt.id); if (e.key === 'Escape') setRenamingStandaloneId(null); }}
                        autoFocus
                        placeholder="ファイル名を入力"
                        className="flex-grow px-2 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                      />
                      <button onClick={() => handleRenameStandalone(receipt.id)} className="px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded">保存</button>
                      <button onClick={() => setRenamingStandaloneId(null)} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-xs rounded">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-grow">{receipt.fileName}</span>
                      <button title="名前を変更" onClick={() => { setRenamingStandaloneId(receipt.id); setRenameStandaloneValue(receipt.fileName); }} className="flex-shrink-0 text-sm text-blue-500 hover:text-blue-700">✎</button>
                    </div>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">{format(getStandaloneDisplayDate(receipt), 'yyyy年MM月dd日')}</span>
                  {/* Linked expenses list with individual unlink buttons */}
                  <div className="flex flex-col gap-1 pt-1 border-t dark:border-gray-700">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">紐付き支出 ({receipt.linkedExpenseIds.length}件)</span>
                      <button
                        onClick={() => openLinkModal(receipt.id)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >＋ 追加</button>
                    </div>
                    {receipt.linkedExpenseIds.map(eid => {
                      const exp = expenseById.get(eid);
                      return (
                        <div key={eid} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 rounded px-2 py-0.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 flex-grow truncate">
                            {exp ? `${format(exp.date.toDate(), 'MM/dd')} ${exp.store || '(店名なし)'} ¥${exp.amount.toLocaleString()}` : eid}
                          </span>
                          <button
                            title="この支出との紐付けを解除"
                            onClick={() => handleUnlinkReceipt(receipt, eid)}
                            className="flex-shrink-0 text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 font-bold"
                          >✕</button>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => handleDeleteStandaloneReceipt(receipt)}
                      disabled={deletingStandaloneId === receipt.id}
                      className="mt-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50 text-left"
                    >{deletingStandaloneId === receipt.id ? '削除中...' : '🗑 ファイルを削除'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search panel */}
      <div className="mb-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-4 space-y-3">
        {/* Primary search row */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-grow">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="名前・店名・メモで検索..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-black text-sm"
            />
          </div>
          <button
            onClick={() => setSearchExpanded(v => !v)}
            className={`px-3 py-2 text-sm border rounded-md whitespace-nowrap ${searchExpanded ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            詳細条件 {searchExpanded ? '▲' : '▼'}
          </button>
          {isSearchActive && (
            <button
              onClick={handleClearSearch}
              className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md whitespace-nowrap"
            >
              クリア
            </button>
          )}
        </div>

        {/* Advanced filters */}
        {searchExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">金額 (下限)</label>
              <input
                type="number"
                value={searchAmountMin}
                onChange={(e) => setSearchAmountMin(e.target.value)}
                placeholder="¥ 以上"
                min={0}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">金額 (上限)</label>
              <input
                type="number"
                value={searchAmountMax}
                onChange={(e) => setSearchAmountMax(e.target.value)}
                placeholder="¥ 以下"
                min={0}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">日付 (開始)</label>
              <input
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">日付 (終了)</label>
              <input
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              />
            </div>
          </div>
        )}

        {isSearchActive && (
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            {searchResults.length} 件見つかりました
          </p>
        )}
      </div>

      {/* ── Search results (overrides normal view when active) ── */}
      {isSearchActive ? (
        <div>
          {searchResults.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg shadow">
              <p className="text-gray-500 dark:text-gray-400 text-lg">条件に一致するレシートが見つかりませんでした。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {searchResults.map(expense => (
                <div key={expense.id} className={`bg-white dark:bg-black border rounded-lg shadow-sm overflow-hidden flex flex-col transition-all ${selectedExistingIds.has(expense.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExistingSelect(expense.id); }}
                      className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedExistingIds.has(expense.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-400 hover:border-indigo-400'}`}
                    >
                      {selectedExistingIds.has(expense.id) && <span className="text-xs">✓</span>}
                    </button>
                    <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
                      {expense.receiptUrl?.toLowerCase().endsWith('.pdf') ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="font-semibold">PDFファイル</span>
                        </div>
                      ) : (
                        <img
                          src={expense.receiptUrl}
                          alt={expense.receiptName || expense.store || 'レシート'}
                          className="absolute inset-0 w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                        />
                      )}
                    </a>
                  </div>
                  <div className="p-3 flex-grow flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {expense.receiptName || expense.store || '(名前未設定)'}
                    </span>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {format(expense.date.toDate(), 'yyyy年MM月dd日')} · ¥{expense.amount.toLocaleString()}
                    </div>
                    {expense.memo && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2">{expense.memo}</div>
                    )}
                    <div className="flex justify-end items-center pt-1 border-t dark:border-gray-700 mt-auto">
                      <button
                        onClick={() => handleRemoveReceipt(expense.id)}
                        disabled={removingId === expense.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                      >{removingId === expense.id ? '解除中...' : '添付を解除'}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Sort toolbar */}
          <div className="flex flex-wrap gap-3 mb-4 items-center justify-end">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">並び順:</label>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              >
                <option value="date_desc">日付（新しい順）</option>
                <option value="date_asc">日付（古い順）</option>
                <option value="amount_desc">金額（高い順）</option>
                <option value="amount_asc">金額（低い順）</option>
                <option value="name_asc">名前（あいうえお順）</option>
              </select>
            </div>
          </div>

          {currentReceipts.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg shadow">
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                {format(currentMonth, 'yyyy年M月')}のレシートはありません。
              </p>
            </div>
          ) : (
            <section>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">レシート・領収書</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {currentReceipts.map((expense) => (
                  <div
                    key={expense.id}
                    className={`bg-white dark:bg-black border rounded-lg shadow-sm overflow-hidden flex flex-col transition-all ${selectedExistingIds.has(expense.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    {/* Thumbnail */}
                    <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExistingSelect(expense.id); }}
                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedExistingIds.has(expense.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-400 hover:border-indigo-400'}`}
                      >
                        {selectedExistingIds.has(expense.id) && <span className="text-xs">✓</span>}
                      </button>
                      <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
                        {expense.receiptUrl?.toLowerCase().endsWith('.pdf') ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className="font-semibold">PDFファイル</span>
                          </div>
                        ) : (
                          <img
                            src={expense.receiptUrl}
                            alt={expense.receiptName || expense.store || 'レシート'}
                            className="absolute inset-0 w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                          />
                        )}
                      </a>
                    </div>

                    <div className="p-3 flex-grow flex flex-col gap-2">
                      {/* Custom name */}
                      {renamingReceiptId === expense.id ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameReceipt(expense.id); if (e.key === 'Escape') setRenamingReceiptId(null); }}
                            autoFocus
                            placeholder="名前を入力"
                            className="flex-grow px-2 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                          />
                          <button onClick={() => handleRenameReceipt(expense.id)} className="px-2 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded">保存</button>
                          <button onClick={() => setRenamingReceiptId(null)} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-grow">
                            {expense.receiptName || expense.store || '(名前未設定)'}
                          </span>
                          <button
                            title="名前を変更"
                            onClick={() => { setRenamingReceiptId(expense.id); setRenameValue(expense.receiptName || ''); }}
                            className="flex-shrink-0 text-sm text-blue-500 hover:text-blue-700"
                          >✎</button>
                        </div>
                      )}

                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {format(expense.date.toDate(), 'yyyy年MM月dd日')} · ¥{expense.amount.toLocaleString()}
                      </div>

                      <div className="flex items-center justify-end pt-1 border-t dark:border-gray-700 mt-auto">
                        <button
                          onClick={() => handleRemoveReceipt(expense.id)}
                          disabled={removingId === expense.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          {removingId === expense.id ? '解除中...' : '添付を解除'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Link modal */}
      {linkingReceiptId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setLinkingReceiptId(null); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">支出と紐付け</h3>
                {(() => {
                  const linkingReceipt = standaloneReceipts.find(r => r.id === linkingReceiptId);
                  return linkingReceipt && linkingReceipt.linkedExpenseIds.length > 0 ? (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                      現在 {linkingReceipt.linkedExpenseIds.length} 件に紐付き済み — 追加で紐付けできます
                    </p>
                  ) : null;
                })()}
              </div>
              <button onClick={() => setLinkingReceiptId(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-3 border-b dark:border-gray-700 space-y-2">
              <input
                type="text"
                value={linkModalSearch}
                onChange={(e) => setLinkModalSearch(e.target.value)}
                placeholder="店名・メモで検索..."
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
              />
              <div className="flex gap-2 items-center">
                <input type="date" value={linkModalDateFrom} onChange={(e) => setLinkModalDateFrom(e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black" />
                <span className="text-gray-400">〜</span>
                <input type="date" value={linkModalDateTo} onChange={(e) => setLinkModalDateTo(e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black" />
              </div>
            </div>
            <div className="overflow-y-auto flex-grow p-3 space-y-2">
              {linkModalLoading ? (
                <p className="text-sm text-center text-gray-500 py-8">読み込み中...</p>
              ) : (
                linkModalExpenses
                  .filter(e => {
                    if (linkModalSearch.trim()) {
                      const q = linkModalSearch.trim().toLowerCase();
                      const haystack = [e.store, e.memo].filter(Boolean).join(' ').toLowerCase();
                      if (!haystack.includes(q)) return false;
                    }
                    if (linkModalDateFrom && e.date.toDate() < new Date(linkModalDateFrom)) return false;
                    if (linkModalDateTo) {
                      const to = new Date(linkModalDateTo);
                      to.setHours(23, 59, 59, 999);
                      if (e.date.toDate() > to) return false;
                    }
                    return true;
                  })
                  .map(e => {
                    const linkingReceipt = standaloneReceipts.find(r => r.id === linkingReceiptId);
                    const alreadyLinkedToThis = linkingReceipt?.linkedExpenseIds.includes(e.id) ?? false;
                    return (
                      <button
                        key={e.id}
                        onClick={() => handleLinkReceipt(e.id)}
                        disabled={alreadyLinkedToThis}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          alreadyLinkedToThis
                            ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 cursor-not-allowed opacity-70'
                            : e.receiptUrl ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{e.store || '(店名なし)'}</span>
                          {alreadyLinkedToThis && (
                            <span className="text-xs bg-indigo-200 dark:bg-indigo-700 text-indigo-800 dark:text-indigo-100 px-1.5 py-0.5 rounded">🔗 紐付き済</span>
                          )}
                          {!alreadyLinkedToThis && e.receiptUrl && (
                            <span className="text-xs bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100 px-1.5 py-0.5 rounded">�� 添付済</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{format(e.date.toDate(), 'yyyy年MM月dd日')} · ¥{e.amount.toLocaleString()}{e.memo ? ` · ${e.memo}` : ''}</div>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
