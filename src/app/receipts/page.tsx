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
import { StandaloneReceipt, ReceiptFolder } from '@/types/Receipt';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';
import { format, addMonths, subMonths, isSameMonth } from 'date-fns';
import Link from 'next/link';

type SortMode = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc';

export default function ReceiptsPage() {
  const { user, loading: authLoading } = useAuth();
  const [allReceipts, setAllReceipts] = useState<Expense[]>([]);
  // All expenses (unfiltered) used for popover lookup – includes expenses
  // that may not have receiptUrl yet but are referenced by linkedExpenseIds
  const [allExpensesMap, setAllExpensesMap] = useState<Map<string, Expense>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Master data
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

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
  const [linkModalSelected, setLinkModalSelected] = useState<Set<string>>(new Set());
  const [deletingStandaloneId, setDeletingStandaloneId] = useState<string | null>(null);
  const [renamingStandaloneId, setRenamingStandaloneId] = useState<string | null>(null);
  const [renameStandaloneValue, setRenameStandaloneValue] = useState('');

  // Folder state
  const [receiptFolders, setReceiptFolders] = useState<ReceiptFolder[]>([]);
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const currentFolderId = folderPath.length > 0 ? folderPath[folderPath.length - 1] : null;
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [draggedReceiptId, setDraggedReceiptId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);

  // Multi-select state
  const [selectedStandaloneIds, setSelectedStandaloneIds] = useState<Set<string>>(new Set());
  const [selectedExistingIds, setSelectedExistingIds] = useState<Set<string>>(new Set());
  const [bulkDateInput, setBulkDateInput] = useState('');
  const [showBulkDatePicker, setShowBulkDatePicker] = useState(false);

  // Linked expense popover
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!activePopoverId) return;
    const handleClick = () => setActivePopoverId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activePopoverId]);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }

    const unsubReceipts = onSnapshot(
      query(collection(db, 'users', user.uid, 'expenses')),
      (snapshot) => {
        const allExp = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
        setAllReceipts(allExp.filter(e => e.receiptUrl && e.receiptUrl.trim() !== ''));
        setAllExpensesMap(new Map(allExp.map(e => [e.id, e])));
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

    const unsubCategories = onSnapshot(
      query(collection(db, 'users', user.uid, 'categories')),
      s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() } as Category)))
    );
    const unsubPaymentMethods = onSnapshot(
      query(collection(db, 'users', user.uid, 'paymentMethods')),
      s => setPaymentMethods(s.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod)))
    );
    const unsubFolders = onSnapshot(
      query(collection(db, 'users', user.uid, 'receiptFolders'), orderBy('createdAt')),
      s => setReceiptFolders(s.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptFolder)))
    );

    return () => { unsubReceipts(); unsubStandalone(); unsubCategories(); unsubPaymentMethods(); unsubFolders(); };
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

  /** Maps expenseId → the StandaloneReceipt that is linked to it (if any). */
  const standaloneForExpense = useMemo(() => {
    const map = new Map<string, StandaloneReceipt>();
    standaloneReceipts.forEach(r => {
      r.linkedExpenseIds.forEach(eid => { if (!map.has(eid)) map.set(eid, r); });
    });
    return map;
  }, [standaloneReceipts]);

  /** Flat list of all folders with hierarchical labels for the move-to dropdown. */
  const allFoldersList = useMemo(() => {
    const result: Array<{id: string, label: string}> = [];
    const build = (parentId: string | null, prefix: string) => {
      receiptFolders
        .filter(f => (f.parentId ?? null) === parentId)
        .forEach(f => {
          const label = prefix ? `${prefix} / ${f.name}` : f.name;
          result.push({ id: f.id, label });
          build(f.id, label);
        });
    };
    build(null, '');
    return result;
  }, [receiptFolders]);

  /** Returns the date to use for a standalone receipt's month bucket. */
  const getStandaloneDisplayDate = (r: StandaloneReceipt): Date =>
    r.displayDate ? r.displayDate.toDate() : r.uploadedAt.toDate();

  /** Renders the linked-expenses speech-bubble popover for an expense card. */
  const renderLinkedExpensesPopover = (expenseId: string) => {
    const standalone = standaloneForExpense.get(expenseId);
    if (!standalone) return null;
    const linkedIds = standalone.linkedExpenseIds;
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActivePopoverId(prev => prev === expenseId ? null : expenseId);
          }}
          className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
        >
          🔗 {linkedIds.length}件の支出 ▾
        </button>
        {activePopoverId === expenseId && (
          <div
            className="absolute bottom-full left-0 mb-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Speech bubble arrow */}
            <div className="absolute bottom-[-6px] left-5 w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
            <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">紐付けられた支出（{linkedIds.length}件）</p>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-b-xl">
              {linkedIds.map(eid => {
                const e = allExpensesMap.get(eid);
                if (!e) return null;
                const isCurrent = eid === expenseId;
                const categoryName = categories.find(c => c.id === e.categoryId)?.name ?? e.categoryId;
                const paymentName = paymentMethods.find(p => p.id === e.paymentMethodId)?.name ?? e.paymentMethodId;
                return (
                  <div
                    key={eid}
                    className={`px-3 py-2.5 text-xs border-b last:border-b-0 border-gray-100 dark:border-gray-700/50 ${isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                  >
                    {/* Row 1: store name + edit button */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className={`font-semibold truncate flex items-center gap-1 ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-100'}`}>
                        {isCurrent && <span className="text-indigo-400 text-[10px]">●</span>}
                        {e.store || '(店名なし)'}
                      </div>
                      <Link
                        href={`/dashboard/edit-expense/${eid}`}
                        onClick={() => setActivePopoverId(null)}
                        className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                      >
                        編集
                      </Link>
                    </div>
                    {/* Row 2: date + amount */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">{format(e.date.toDate(), 'yyyy/MM/dd')}</span>
                      <span className={`font-semibold ${isCurrent ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>
                        ¥{e.amount.toLocaleString()}
                      </span>
                    </div>
                    {/* Row 3: category + payment method */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px]">
                        🏷 {categoryName}
                      </span>
                      <span className="inline-flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px]">
                        💳 {paymentName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

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
    if (!user || !confirm('このレシートの添付を解除しますか？（支出の記録は残ります）')) return;
    setRemovingId(expenseId);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid, 'expenses', expenseId), { receiptUrl: '' });
      // If this receipt was linked via a standalone file, also remove from its linkedExpenseIds
      const linked = standaloneReceipts.find(r => r.linkedExpenseIds.includes(expenseId));
      if (linked) {
        const remaining = linked.linkedExpenseIds.filter(id => id !== expenseId);
        batch.update(doc(db, 'users', user.uid, 'receipts', linked.id), {
          linkedExpenseIds: arrayRemove(expenseId),
          ...(remaining.length === 0 ? { displayDate: null } : {}),
        });
      }
      await batch.commit();
    } catch {
      alert('解除に失敗しました。');
    } finally {
      setRemovingId(null);
    }
  };

  // ── Folder handlers ────────────────────────────────────────

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    await addDoc(collection(db, 'users', user.uid, 'receiptFolders'), {
      name: newFolderName.trim(),
      createdAt: Timestamp.now(),
      parentId: currentFolderId ?? null,
    });
    setNewFolderName('');
    setShowCreateFolder(false);
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!user || !renameFolderValue.trim()) return;
    await updateDoc(doc(db, 'users', user.uid, 'receiptFolders', folderId), { name: renameFolderValue.trim() });
    setRenamingFolderId(null);
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return;
    if (!confirm('このフォルダを削除しますか？フォルダ内のファイルはルートに移動されます。')) return;
    // Move all receipts in this folder to root
    const batch = writeBatch(db);
    standaloneReceipts
      .filter(r => r.receiptFolderId === folderId)
      .forEach(r => batch.update(doc(db, 'users', user.uid, 'receipts', r.id), { receiptFolderId: null }));
    batch.delete(doc(db, 'users', user.uid, 'receiptFolders', folderId));
    await batch.commit();
    if (currentFolderId === folderId) setFolderPath(prev => prev.slice(0, -1));
  };

  const handleMoveToFolder = async (receiptId: string, folderId: string | null) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'receipts', receiptId), { receiptFolderId: folderId ?? null });
  };

  // Drag-drop helpers for moving receipts into folders
  const handleDragStart = (receiptId: string, e: React.DragEvent) => {
    setDraggedReceiptId(receiptId);
    e.dataTransfer.setData('text/plain', receiptId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => { setDraggedReceiptId(null); setDropTargetFolderId(null); };

  const navigateIntoFolder = (folderId: string) => setFolderPath(prev => [...prev, folderId]);
  const navigateToPath = (index: number) => setFolderPath(prev => prev.slice(0, index + 1));
  const navigateToRoot = () => setFolderPath([]);

  const handleFolderDragOver = (folderId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetFolderId(folderId);
  };

  const handleFolderDrop = async (folderId: string, e: React.DragEvent) => {
    e.preventDefault();
    const receiptId = e.dataTransfer.getData('text/plain') || draggedReceiptId;
    setDropTargetFolderId(null);
    setDraggedReceiptId(null);
    if (!receiptId || !user) return;
    await handleMoveToFolder(receiptId, folderId);
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
    setLinkModalSelected(new Set());
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

  /** Link the standalone receipt to ALL selected expenses in one batch. */
  const handleLinkReceipt = async () => {
    if (!user || !linkingReceiptId || linkModalSelected.size === 0) return;
    const receipt = standaloneReceipts.find(r => r.id === linkingReceiptId);
    if (!receipt) return;

    const selectedExpenses = linkModalExpenses.filter(e => linkModalSelected.has(e.id));

    // Warn if receipt is already linked (adding more)
    if (receipt.linkedExpenseIds.length > 0) {
      if (!confirm(
        `このファイルはすでに ${receipt.linkedExpenseIds.length} 件の支出に紐付けられています。\n` +
        `さらに ${selectedExpenses.length} 件を追加で紐付けますか？`
      )) return;
    }

    // Warn if any selected expense already has a DIFFERENT receipt
    const overwriteTargets = selectedExpenses.filter(
      e => e.receiptUrl && e.receiptUrl.trim() !== '' && e.receiptUrl !== receipt.fileUrl
    );
    if (overwriteTargets.length > 0) {
      const names = overwriteTargets.map(e => `「${e.store || '(店名なし)'}」`).join('、');
      if (!confirm(`${names} には既に別のレシートが添付されています。上書きしますか？`)) return;
    }

    const isFirstLink = receipt.linkedExpenseIds.length === 0;
    const batch = writeBatch(db);
    // Update standalone receipt: add all selected IDs at once
    batch.update(doc(db, 'users', user.uid, 'receipts', linkingReceiptId), {
      linkedExpenseIds: arrayUnion(...selectedExpenses.map(e => e.id)),
      ...(isFirstLink ? { displayDate: selectedExpenses[0].date } : {}),
    });
    // Update each selected expense
    selectedExpenses.forEach(expense => {
      batch.update(doc(db, 'users', user.uid, 'expenses', expense.id), {
        receiptUrl: receipt.fileUrl,
        receiptName: receipt.fileName,
      });
    });
    await batch.commit();
    setLinkingReceiptId(null);
    setLinkModalSelected(new Set());
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
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault(); setIsDragging(true);
        }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) { setIsDragging(false); return; }
          handleDrop(e);
        }}
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

      {/* ── Folders + Standalone receipts section ──────────── */}
      <div className="mb-6">
        {/* Header: breadcrumb + new folder button */}
        <div className="flex items-center justify-between mb-3">
          {folderPath.length > 0 ? (
            <nav className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
              <button onClick={navigateToRoot} className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap">ルート</button>
              {folderPath.map((fid, idx) => {
                const folder = receiptFolders.find(f => f.id === fid);
                const isLast = idx === folderPath.length - 1;
                return (
                  <span key={fid} className="flex items-center gap-1">
                    <span className="text-gray-400">›</span>
                    {isLast ? (
                      <span className="font-bold text-gray-800 dark:text-white truncate max-w-[160px]">{folder?.name ?? fid}</span>
                    ) : (
                      <button onClick={() => navigateToPath(idx)} className="text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[120px]">{folder?.name ?? fid}</button>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : (
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">📁 フォルダ</h2>
          )}
          <button
            onClick={() => setShowCreateFolder(true)}
            className="text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-1 shrink-0"
          >＋ 新規フォルダ</button>
        </div>

        {/* Create folder form */}
        {showCreateFolder && (
          <div className="mb-4 flex gap-2 items-center">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setShowCreateFolder(false); setNewFolderName(''); }
              }}
              autoFocus
              placeholder="フォルダ名を入力..."
              className="flex-grow px-3 py-1.5 text-sm border border-indigo-400 rounded-lg bg-white dark:bg-black focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-40">作成</button>
            <button onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }} className="px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">✕</button>
          </div>
        )}

        {/* "↑ 上のフォルダへ" drop zone (shown when inside a folder) */}
        {folderPath.length > 0 && (() => {
          const parentFolderId = folderPath.length >= 2 ? folderPath[folderPath.length - 2] : null;
          const isOver = dropTargetFolderId === '__parent__';
          return (
            <div
              onDragOver={e => {
                if (!e.dataTransfer.types.includes('text/plain')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropTargetFolderId('__parent__');
              }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetFolderId(null); }}
              onDrop={async e => {
                e.preventDefault();
                const receiptId = e.dataTransfer.getData('text/plain') || draggedReceiptId;
                setDropTargetFolderId(null);
                setDraggedReceiptId(null);
                if (!receiptId || !user) return;
                await handleMoveToFolder(receiptId, parentFolderId);
              }}
              className={`mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed text-sm transition-all cursor-default ${
                isOver
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400'
              }`}
            >
              <span>↑ 上のフォルダへ</span>
              <span className="text-xs opacity-70">ここにドロップで上に移動</span>
            </div>
          );
        })()}

        {/* Folder grid - sub-folders of current level */}
        {(() => {
          const subFolders = receiptFolders.filter(f => (f.parentId ?? null) === (currentFolderId ?? null));
          if (subFolders.length === 0) return null;
          return (
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5"
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetFolderId(null); }}
            >
              {subFolders.map(folder => {
                const fileCount = standaloneReceipts.filter(r => r.receiptFolderId === folder.id).length;
                const subFolderCount = receiptFolders.filter(f => (f.parentId ?? null) === folder.id).length;
                const isDropTarget = dropTargetFolderId === folder.id;
                const isDragHint = draggedReceiptId !== null && !isDropTarget;
                return (
                  <div
                    key={folder.id}
                    onClick={() => { if (renamingFolderId !== folder.id) navigateIntoFolder(folder.id); }}
                    onDragOver={e => {
                      if (!e.dataTransfer.types.includes('text/plain')) return;
                      handleFolderDragOver(folder.id, e);
                    }}
                    onDrop={e => handleFolderDrop(folder.id, e)}
                    className={`group relative flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isDropTarget
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 scale-105 shadow-lg'
                        : isDragHint
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10 border-dashed'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                    }`}
                  >
                    <span className="text-4xl mb-1">{isDropTarget ? '📂' : '📁'}</span>
                    {renamingFolderId === folder.id ? (
                      <input
                        type="text"
                        value={renameFolderValue}
                        onChange={e => setRenameFolderValue(e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleRenameFolder(folder.id);
                          if (e.key === 'Escape') setRenamingFolderId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        className="w-full text-center text-xs px-1 py-0.5 border border-indigo-400 rounded bg-white dark:bg-black focus:outline-none"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 text-center line-clamp-2">{folder.name}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {fileCount}件{subFolderCount > 0 ? ` · ${subFolderCount}フォルダ` : ''}
                    </span>
                    {/* Hover actions */}
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button
                        title="名前を変更"
                        onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-800 text-xs"
                      >✎</button>
                      <button
                        title="削除"
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white/80 dark:bg-gray-700/80 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 text-xs"
                      >🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Folder contents (inside a folder – all months) ── */}
        {currentFolderId && (() => {
          const folderReceipts = standaloneReceipts.filter(r => r.receiptFolderId === currentFolderId);
          return folderReceipts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">このフォルダにはファイルがありません。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {folderReceipts.map(receipt => (
                <div
                  key={receipt.id}
                  draggable={true}
                  onDragStart={e => handleDragStart(receipt.id, e)}
                  onDragEnd={handleDragEnd}
                  className={`bg-white dark:bg-black border rounded-lg shadow-sm overflow-hidden flex flex-col transition-all cursor-grab active:cursor-grabbing ${selectedStandaloneIds.has(receipt.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                    <button
                      onClick={e => { e.stopPropagation(); toggleStandaloneSelect(receipt.id); }}
                      className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedStandaloneIds.has(receipt.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-400 hover:border-indigo-400'}`}
                    >{selectedStandaloneIds.has(receipt.id) && <span className="text-xs">✓</span>}</button>
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
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-grow">{receipt.fileName}</span>
                      <button title="名前を変更" onClick={() => { setRenamingStandaloneId(receipt.id); setRenameStandaloneValue(receipt.fileName); }} className="flex-shrink-0 text-sm text-blue-500 hover:text-blue-700">✎</button>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{format(getStandaloneDisplayDate(receipt), 'yyyy年MM月dd日')}</span>
                    {/* Move to folder dropdown */}
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value === '__parent__') handleMoveToFolder(receipt.id, folderPath[folderPath.length - 2] ?? null);
                        else if (e.target.value) handleMoveToFolder(receipt.id, e.target.value);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-gray-600 dark:text-gray-400"
                    >
                      <option value="" disabled>📁 フォルダに移動...</option>
                      <option value="__parent__">↩ 取り出す</option>
                      {allFoldersList.filter(f => f.id !== currentFolderId).map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t dark:border-gray-700">
                      <button onClick={() => openLinkModal(receipt.id)} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded">支出と紐付け</button>
                      <button onClick={() => handleDeleteStandaloneReceipt(receipt)} disabled={deletingStandaloneId === receipt.id} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                        {deletingStandaloneId === receipt.id ? '削除中...' : '削除'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Root: unlinked standalone receipts (no folder, month-filtered) ── */}
        {!currentFolderId && (() => {
          const rootUnlinked = standaloneReceipts.filter(r =>
            r.linkedExpenseIds.length === 0 &&
            !r.receiptFolderId &&
            isSameMonth(getStandaloneDisplayDate(r), currentMonth)
          );
          if (rootUnlinked.length === 0) return null;
          return (
            <div>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">未紐付きレシート</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {rootUnlinked.map(receipt => (
                  <div
                    key={receipt.id}
                    draggable={true}
                    onDragStart={e => handleDragStart(receipt.id, e)}
                    onDragEnd={handleDragEnd}
                    className={`bg-white dark:bg-black border rounded-lg shadow-sm overflow-hidden flex flex-col transition-all cursor-grab active:cursor-grabbing ${selectedStandaloneIds.has(receipt.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                      <button
                        onClick={e => { e.stopPropagation(); toggleStandaloneSelect(receipt.id); }}
                        className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedStandaloneIds.has(receipt.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/80 border-gray-400 hover:border-indigo-400'}`}
                      >{selectedStandaloneIds.has(receipt.id) && <span className="text-xs">✓</span>}</button>
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
                            onChange={e => setRenameStandaloneValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameStandalone(receipt.id); if (e.key === 'Escape') setRenamingStandaloneId(null); }}
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
                      {/* Folder selector */}
                      {allFoldersList.length > 0 && (
                        <select
                          value=""
                          onChange={e => { if (e.target.value) handleMoveToFolder(receipt.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-gray-600 dark:text-gray-400"
                        >
                          <option value="" disabled>📁 フォルダに移動...</option>
                          {allFoldersList.map(f => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex gap-2 pt-1 border-t dark:border-gray-700">
                        <button onClick={() => openLinkModal(receipt.id)} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded">支出と紐付け</button>
                        <button onClick={() => handleDeleteStandaloneReceipt(receipt)} disabled={deletingStandaloneId === receipt.id} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                          {deletingStandaloneId === receipt.id ? '削除中...' : '削除'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

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
                <div key={expense.id} className={`bg-white dark:bg-black border rounded-lg shadow-sm flex flex-col transition-all relative ${selectedExistingIds.has(expense.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}>
                  <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group rounded-t-lg overflow-hidden">
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
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate flex-grow">
                        {expense.receiptName || expense.store || '(名前未設定)'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {format(expense.date.toDate(), 'yyyy年MM月dd日')} · ¥{expense.amount.toLocaleString()}
                    </div>
                    {expense.memo && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2">{expense.memo}</div>
                    )}
                    {/* Linked expenses popover */}
                    {renderLinkedExpensesPopover(expense.id)}
                    <div className="flex justify-between items-center pt-1 border-t dark:border-gray-700 mt-auto">
                      {standaloneForExpense.has(expense.id) && (
                        <button
                          onClick={() => openLinkModal(standaloneForExpense.get(expense.id)!.id)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                        >他の支出にも紐付け</button>
                      )}
                      <button
                        onClick={() => handleRemoveReceipt(expense.id)}
                        disabled={removingId === expense.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 ml-auto"
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
                    className={`bg-white dark:bg-black border rounded-lg shadow-sm flex flex-col transition-all relative ${selectedExistingIds.has(expense.id) ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    {/* Thumbnail */}
                    <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group rounded-t-lg overflow-hidden">
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

                      {/* Linked expenses popover */}
                      {renderLinkedExpensesPopover(expense.id)}

                      <div className="flex items-center justify-between pt-1 border-t dark:border-gray-700 mt-auto">
                        {standaloneForExpense.has(expense.id) && (
                          <button
                            onClick={() => openLinkModal(standaloneForExpense.get(expense.id)!.id)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          >他の支出にも紐付け</button>
                        )}
                        <button
                          onClick={() => handleRemoveReceipt(expense.id)}
                          disabled={removingId === expense.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 ml-auto"
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
          onClick={(e) => { if (e.target === e.currentTarget) { setLinkingReceiptId(null); setLinkModalSelected(new Set()); } }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">支出と紐付け</h3>
                {(() => {
                  const linkingReceipt = standaloneReceipts.find(r => r.id === linkingReceiptId);
                  return linkingReceipt && linkingReceipt.linkedExpenseIds.length > 0 ? (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                      現在 {linkingReceipt.linkedExpenseIds.length} 件に紐付き済み — 追加選択できます
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">チェックして一括紐付け</p>
                  );
                })()}
              </div>
              <button onClick={() => { setLinkingReceiptId(null); setLinkModalSelected(new Set()); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Filters */}
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

            {/* Expense list with checkboxes */}
            <div className="overflow-y-auto flex-grow p-3 space-y-1.5">
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
                    const alreadyLinked = linkingReceipt?.linkedExpenseIds.includes(e.id) ?? false;
                    const isSelected = linkModalSelected.has(e.id);
                    return (
                      <label
                        key={e.id}
                        className={`flex items-start gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          alreadyLinked
                            ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 cursor-not-allowed opacity-70'
                            : isSelected
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-400'
                            : e.receiptUrl && e.receiptUrl !== standaloneReceipts.find(r => r.id === linkingReceiptId)?.fileUrl
                            ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-indigo-600 w-4 h-4 flex-shrink-0"
                          disabled={alreadyLinked}
                          checked={alreadyLinked || isSelected}
                          onChange={() => {
                            if (alreadyLinked) return;
                            setLinkModalSelected(prev => {
                              const next = new Set(prev);
                              next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{e.store || '(店名なし)'}</span>
                            {alreadyLinked && (
                              <span className="text-xs bg-indigo-200 dark:bg-indigo-700 text-indigo-800 dark:text-indigo-100 px-1.5 py-0.5 rounded">🔗 紐付き済</span>
                            )}
                            {!alreadyLinked && e.receiptUrl && e.receiptUrl !== standaloneReceipts.find(r => r.id === linkingReceiptId)?.fileUrl && (
                              <span className="text-xs bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100 px-1.5 py-0.5 rounded">📎 添付済</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{format(e.date.toDate(), 'yyyy年MM月dd日')} · ¥{e.amount.toLocaleString()}{e.memo ? ` · ${e.memo}` : ''}</div>
                        </div>
                      </label>
                    );
                  })
              )}
            </div>

            {/* Footer with confirm button */}
            <div className="p-4 border-t dark:border-gray-700 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {linkModalSelected.size > 0 ? `${linkModalSelected.size} 件を選択中` : '支出を選択してください'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setLinkingReceiptId(null); setLinkModalSelected(new Set()); }}
                  className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >キャンセル</button>
                <button
                  onClick={handleLinkReceipt}
                  disabled={linkModalSelected.size === 0}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {linkModalSelected.size > 0 ? `${linkModalSelected.size} 件に紐付ける` : '紐付ける'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
