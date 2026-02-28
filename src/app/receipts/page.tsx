"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { db, storage } from '@/lib/firebase/config';
import {
  collection, query, onSnapshot, doc, updateDoc,
  addDoc, deleteDoc, writeBatch, getDocs, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { StandaloneReceipt } from '@/types/Receipt';
import { format } from 'date-fns';
import Link from 'next/link';

interface ReceiptFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

type SortMode = 'custom' | 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc';

export default function ReceiptsPage() {
  const { user, loading: authLoading } = useAuth();
  const [allReceipts, setAllReceipts] = useState<Expense[]>([]);
  const [folders, setFolders] = useState<ReceiptFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('custom');

  // UI states
  const [renamingReceiptId, setRenamingReceiptId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [movingReceiptId, setMovingReceiptId] = useState<string | null>(null);
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [linkingReceiptId, setLinkingReceiptId] = useState<string | null>(null);
  const [linkModalExpenses, setLinkModalExpenses] = useState<Expense[]>([]);
  const [linkModalLoading, setLinkModalLoading] = useState(false);
  const [linkModalSearch, setLinkModalSearch] = useState('');
  const [linkModalDateFrom, setLinkModalDateFrom] = useState('');
  const [linkModalDateTo, setLinkModalDateTo] = useState('');
  const [deletingStandaloneId, setDeletingStandaloneId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const unsubFolders = onSnapshot(
      query(collection(db, 'users', user.uid, 'receiptFolders')),
      (snapshot) => {
        setFolders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptFolder)));
      }
    );

    const unsubStandalone = onSnapshot(
      query(collection(db, 'users', user.uid, 'receipts')),
      (snapshot) => {
        setStandaloneReceipts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StandaloneReceipt)));
      }
    );

    return () => { unsubReceipts(); unsubFolders(); unsubStandalone(); };
  }, [user, authLoading]);

  // Breadcrumb path to current folder
  const folderPath = useMemo(() => {
    if (!currentFolderId) return [];
    const path: ReceiptFolder[] = [];
    let cur: ReceiptFolder | undefined = folders.find(f => f.id === currentFolderId);
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? folders.find(f => f.id === cur!.parentId) : undefined;
    }
    return path;
  }, [currentFolderId, folders]);

  // Folders directly inside the current folder
  const currentFolders = useMemo(() =>
    folders
      .filter(f => f.parentId === currentFolderId)
      .sort((a, b) => a.order - b.order),
    [folders, currentFolderId]
  );

  // Receipts directly inside the current folder, sorted
  const currentReceipts = useMemo(() => {
    const filtered = allReceipts.filter(e => (e.receiptFolderId ?? null) === currentFolderId);
    switch (sortMode) {
      case 'date_desc':  return [...filtered].sort((a, b) => b.date.toMillis() - a.date.toMillis());
      case 'date_asc':   return [...filtered].sort((a, b) => a.date.toMillis() - b.date.toMillis());
      case 'amount_desc': return [...filtered].sort((a, b) => b.amount - a.amount);
      case 'amount_asc': return [...filtered].sort((a, b) => a.amount - b.amount);
      case 'name_asc':   return [...filtered].sort((a, b) =>
        (a.receiptName || a.store || '').localeCompare(b.receiptName || b.store || '', 'ja'));
      default:           return [...filtered].sort((a, b) => (a.receiptOrder ?? 0) - (b.receiptOrder ?? 0));
    }
  }, [allReceipts, currentFolderId, sortMode]);

  // Flat list of all folders for move dropdown (recursive)
  const buildFolderOptions = (parentId: string | null, depth: number): { id: string | null; label: string }[] => {
    const result: { id: string | null; label: string }[] = [];
    folders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach(f => {
        result.push({ id: f.id, label: '\u3000'.repeat(depth) + '📁 ' + f.name });
        result.push(...buildFolderOptions(f.id, depth + 1));
      });
    return result;
  };
  const folderOptions = useMemo(
    () => [{ id: null, label: '📂 ルート' }, ...buildFolderOptions(null, 0)],
    [folders]
  );

  // Search helpers
  const isSearchActive = searchText.trim() !== '' || searchAmountMin !== '' || searchAmountMax !== '' || searchDateFrom !== '' || searchDateTo !== '';

  const getFolderPathLabel = (folderId: string | null | undefined): string => {
    if (!folderId) return 'ルート';
    const parts: string[] = [];
    let cur: ReceiptFolder | undefined = folders.find(f => f.id === folderId);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? folders.find(f => f.id === cur!.parentId) : undefined;
    }
    return parts.join(' / ');
  };

  const searchResults = useMemo(() => {
    if (!isSearchActive) return [];
    return allReceipts.filter(e => {
      // Text: match receiptName, store, memo
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const haystack = [e.receiptName, e.store, e.memo].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Amount min
      if (searchAmountMin !== '' && e.amount < Number(searchAmountMin)) return false;
      // Amount max
      if (searchAmountMax !== '' && e.amount > Number(searchAmountMax)) return false;
      // Date from
      if (searchDateFrom) {
        const from = new Date(searchDateFrom);
        if (e.date.toDate() < from) return false;
      }
      // Date to
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

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    const maxOrder = Math.max(-1, ...currentFolders.map(f => f.order));
    await addDoc(collection(db, 'users', user.uid, 'receiptFolders'), {
      name: newFolderName.trim(),
      parentId: currentFolderId,
      order: maxOrder + 1,
    });
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!user || !renameFolderValue.trim()) return;
    await updateDoc(doc(db, 'users', user.uid, 'receiptFolders', folderId), {
      name: renameFolderValue.trim(),
    });
    setRenamingFolderId(null);
  };

  const handleDeleteFolder = async (folder: ReceiptFolder) => {
    if (!user) return;
    const hasChildren = folders.some(f => f.parentId === folder.id);
    const hasReceipts = allReceipts.some(e => (e.receiptFolderId ?? null) === folder.id);
    const confirmMsg = (hasChildren || hasReceipts)
      ? `フォルダ「${folder.name}」内にアイテムがあります。削除すると中のアイテムは親フォルダに移動します。続けますか？`
      : `フォルダ「${folder.name}」を削除しますか？`;
    if (!confirm(confirmMsg)) return;

    const batch = writeBatch(db);
    folders.filter(f => f.parentId === folder.id).forEach(f =>
      batch.update(doc(db, 'users', user.uid, 'receiptFolders', f.id), { parentId: folder.parentId ?? null })
    );
    allReceipts.filter(e => (e.receiptFolderId ?? null) === folder.id).forEach(e =>
      batch.update(doc(db, 'users', user.uid, 'expenses', e.id), { receiptFolderId: folder.parentId ?? null })
    );
    batch.delete(doc(db, 'users', user.uid, 'receiptFolders', folder.id));
    await batch.commit();
    if (currentFolderId === folder.id) setCurrentFolderId(folder.parentId);
  };

  const handleRenameReceipt = async (expenseId: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'expenses', expenseId), {
      receiptName: renameValue.trim() || null,
    });
    setRenamingReceiptId(null);
  };

  const handleMoveReceipt = async (expenseId: string, targetFolderId: string | null) => {
    if (!user) return;
    const maxOrder = Math.max(-1, ...allReceipts
      .filter(e => (e.receiptFolderId ?? null) === targetFolderId)
      .map(e => e.receiptOrder ?? 0));
    await updateDoc(doc(db, 'users', user.uid, 'expenses', expenseId), {
      receiptFolderId: targetFolderId,
      receiptOrder: maxOrder + 1,
    });
    setMovingReceiptId(null);
  };

  const handleReorderReceipts = async (idx: number, direction: 'up' | 'down') => {
    if (!user) return;
    const arr = currentReceipts;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    const batch = writeBatch(db);
    const aOrder = arr[idx].receiptOrder ?? idx;
    const bOrder = arr[swapIdx].receiptOrder ?? swapIdx;
    batch.update(doc(db, 'users', user.uid, 'expenses', arr[idx].id), { receiptOrder: bOrder });
    batch.update(doc(db, 'users', user.uid, 'expenses', arr[swapIdx].id), { receiptOrder: aOrder });
    await batch.commit();
  };

  const handleReorderFolders = async (idx: number, direction: 'up' | 'down') => {
    if (!user) return;
    const arr = currentFolders;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'receiptFolders', arr[idx].id), { order: arr[swapIdx].order });
    batch.update(doc(db, 'users', user.uid, 'receiptFolders', arr[swapIdx].id), { order: arr[idx].order });
    await batch.commit();
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

  const handleFileUpload = async (file: File) => {
    if (!user) return;
    setUploadingFile(true);
    try {
      const timestamp = Date.now();
      const path = `receipts/${user.uid}/standalone/${timestamp}_${file.name}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const fileUrl = await getDownloadURL(sRef);
      await addDoc(collection(db, 'users', user.uid, 'receipts'), {
        fileUrl,
        fileName: file.name,
        fileType: file.type,
        storagePath: path,
        uploadedAt: Timestamp.now(),
        linkedExpenseId: null,
      });
    } catch (e) {
      console.error(e);
      alert('アップロードに失敗しました。');
    } finally {
      setUploadingFile(false);
    }
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
    if (!receipt) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'receipts', linkingReceiptId), { linkedExpenseId: expenseId });
    batch.update(doc(db, 'users', user.uid, 'expenses', expenseId), {
      receiptUrl: receipt.fileUrl,
      receiptName: receipt.fileName,
    });
    await batch.commit();
    setLinkingReceiptId(null);
  };

  const handleUnlinkReceipt = async (receipt: StandaloneReceipt) => {
    if (!user || !receipt.linkedExpenseId) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid, 'receipts', receipt.id), { linkedExpenseId: null });
    batch.update(doc(db, 'users', user.uid, 'expenses', receipt.linkedExpenseId), { receiptUrl: '' });
    await batch.commit();
  };

  const handleDeleteStandaloneReceipt = async (receipt: StandaloneReceipt) => {
    if (!user || !confirm(`「${receipt.fileName}」を削除しますか？`)) return;
    setDeletingStandaloneId(receipt.id);
    try {
      await deleteObject(storageRef(storage, receipt.storagePath));
      if (receipt.linkedExpenseId) {
        await updateDoc(doc(db, 'users', user.uid, 'expenses', receipt.linkedExpenseId), { receiptUrl: '' });
      }
      await deleteDoc(doc(db, 'users', user.uid, 'receipts', receipt.id));
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました。');
    } finally {
      setDeletingStandaloneId(null);
    }
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">レシート・領収書一覧</h1>
        <Link
          href="/transactions/expense"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          支出を記録する
        </Link>
      </div>

      {/* Upload zone */}
      <div
        className={`mb-5 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); e.target.value = ''; }}
        />
        {uploadingFile ? (
          <p className="text-sm text-indigo-600 dark:text-indigo-400">アップロード中...</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">ここにファイルをドロップ、またはクリックして選択</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">対応形式: 画像・PDF</p>
          </>
        )}
      </div>

      {/* Unlinked standalone receipts */}
      {standaloneReceipts.filter(r => r.linkedExpenseId === null).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">未紐付きレシート</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {standaloneReceipts.filter(r => r.linkedExpenseId === null).map(receipt => (
              <div key={receipt.id} className="bg-white dark:bg-black border dark:border-gray-700 rounded-lg shadow-sm overflow-hidden flex flex-col">
                <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
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
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{receipt.fileName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{format(receipt.uploadedAt.toDate(), 'yyyy年MM月dd日')}</span>
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
      {standaloneReceipts.filter(r => r.linkedExpenseId !== null).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">紐付き済みレシート（アップロード分）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {standaloneReceipts.filter(r => r.linkedExpenseId !== null).map(receipt => (
              <div key={receipt.id} className="bg-white dark:bg-black border dark:border-gray-700 rounded-lg shadow-sm overflow-hidden flex flex-col">
                <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
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
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{receipt.fileName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{format(receipt.uploadedAt.toDate(), 'yyyy年MM月dd日')}</span>
                  <div className="flex gap-2 pt-1 border-t dark:border-gray-700">
                    <button
                      onClick={() => handleUnlinkReceipt(receipt)}
                      className="flex-1 text-xs bg-amber-500 hover:bg-amber-600 text-white py-1 px-2 rounded"
                    >支出から紐付け解除</button>
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
            {searchResults.length} 件見つかりました（全フォルダ対象）
          </p>
        )}
      </div>

      {/* ── Search results (overrides folder view when active) ── */}
      {isSearchActive ? (
        <div>
          {searchResults.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg shadow">
              <p className="text-gray-500 dark:text-gray-400 text-lg">条件に一致するレシートが見つかりませんでした。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {searchResults.map(expense => (
                <div key={expense.id} className="bg-white dark:bg-black border dark:border-gray-700 rounded-lg shadow-sm overflow-hidden flex flex-col">
                  <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group">
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
                    <div className="text-xs text-indigo-500 dark:text-indigo-400 truncate">
                      📁 {getFolderPathLabel(expense.receiptFolderId)}
                    </div>
                    {expense.memo && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2">{expense.memo}</div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t dark:border-gray-700 mt-auto">
                      <button
                        onClick={() => { setCurrentFolderId(expense.receiptFolderId ?? null); handleClearSearch(); }}
                        className="text-xs text-indigo-500 hover:text-indigo-700"
                      >フォルダへ移動</button>
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
      <nav className="flex items-center gap-1 mb-4 text-sm flex-wrap">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`hover:underline ${currentFolderId === null ? 'font-bold text-indigo-600' : 'text-gray-500 dark:text-gray-400'}`}
        >
          ルート
        </button>
        {folderPath.map(folder => (
          <span key={folder.id} className="flex items-center gap-1">
            <span className="text-gray-400">/</span>
            <button
              onClick={() => setCurrentFolderId(folder.id)}
              className={`hover:underline ${currentFolderId === folder.id ? 'font-bold text-indigo-600' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <button
          onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
          className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold rounded text-sm"
        >
          📁 新規フォルダ
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-600 dark:text-gray-400">並び順:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
          >
            <option value="custom">カスタム順</option>
            <option value="date_desc">日付（新しい順）</option>
            <option value="date_asc">日付（古い順）</option>
            <option value="amount_desc">金額（高い順）</option>
            <option value="amount_asc">金額（低い順）</option>
            <option value="name_asc">名前（あいうえお順）</option>
          </select>
        </div>
      </div>

      {/* New folder input */}
      {creatingFolder && (
        <div className="mb-4 flex gap-2 items-center p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 rounded-lg">
          <span>📁</span>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
            placeholder="フォルダ名"
            autoFocus
            className="flex-grow px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
          />
          <button onClick={handleCreateFolder} className="px-3 py-1 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded text-sm">作成</button>
          <button onClick={() => setCreatingFolder(false)} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 rounded text-sm">キャンセル</button>
        </div>
      )}

      {/* Back button */}
      {currentFolderId && (
        <button
          onClick={() => setCurrentFolderId(folderPath[folderPath.length - 2]?.id ?? null)}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← 上のフォルダへ
        </button>
      )}

      {currentFolders.length === 0 && currentReceipts.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg shadow">
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            {currentFolderId ? 'このフォルダは空です。' : '添付されたレシートはありません。'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Folders ── */}
          {currentFolders.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">フォルダ</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {currentFolders.map((folder, idx) => (
                  <div key={folder.id} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 flex flex-col gap-2">
                    {renamingFolderId === folder.id ? (
                      <input
                        type="text"
                        value={renameFolderValue}
                        onChange={(e) => setRenameFolderValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(folder.id); if (e.key === 'Escape') setRenamingFolderId(null); }}
                        autoFocus
                        className="w-full px-1 py-0.5 text-sm border border-gray-300 rounded bg-white dark:bg-black"
                      />
                    ) : (
                      <button
                        onClick={() => setCurrentFolderId(folder.id)}
                        className="flex items-center gap-1 text-left hover:underline"
                      >
                        <span className="text-2xl">📁</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 break-all">{folder.name}</span>
                      </button>
                    )}
                    <div className="flex gap-1 justify-between mt-auto">
                      <div className="flex gap-0.5">
                        <button onClick={() => handleReorderFolders(idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs">▲</button>
                        <button onClick={() => handleReorderFolders(idx, 'down')} disabled={idx === currentFolders.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs">▼</button>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >名前変更</button>
                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >削除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Receipts ── */}
          {currentReceipts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">レシート・領収書</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {currentReceipts.map((expense, idx) => (
                  <div key={expense.id} className="bg-white dark:bg-black border dark:border-gray-700 rounded-lg shadow-sm overflow-hidden flex flex-col">

                    {/* Thumbnail */}
                    <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group">
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

                      {/* Move to folder */}
                      {movingReceiptId === expense.id ? (
                        <div className="flex gap-1 items-center">
                          <select
                            defaultValue={expense.receiptFolderId ?? ''}
                            onChange={(e) => handleMoveReceipt(expense.id, e.target.value === '' ? null : e.target.value)}
                            className="flex-grow text-xs px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                          >
                            {folderOptions.map(opt => (
                              <option key={String(opt.id)} value={opt.id ?? ''}>{opt.label}</option>
                            ))}
                          </select>
                          <button onClick={() => setMovingReceiptId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMovingReceiptId(expense.id)}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 text-left"
                        >
                          📁 フォルダへ移動
                        </button>
                      )}

                      {/* Reorder (custom mode only) + remove */}
                      <div className="flex items-center justify-between pt-1 border-t dark:border-gray-700 mt-auto">
                        {sortMode === 'custom' ? (
                          <div className="flex gap-0.5">
                            <button onClick={() => handleReorderReceipts(idx, 'up')} disabled={idx === 0} title="上へ" className="px-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs">▲</button>
                            <button onClick={() => handleReorderReceipts(idx, 'down')} disabled={idx === currentReceipts.length - 1} title="下へ" className="px-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs">▼</button>
                          </div>
                        ) : <span />}
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
        </div>
      )}
        </>
      )}
      {linkingReceiptId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setLinkingReceiptId(null); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">支出と紐付け</h3>
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
                  .map(e => (
                    <button
                      key={e.id}
                      onClick={() => handleLinkReceipt(e.id)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{e.store || '(店名なし)'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{format(e.date.toDate(), 'yyyy年MM月dd日')} · ¥{e.amount.toLocaleString()}{e.memo ? ` · ${e.memo}` : ''}</div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


