"use client";

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
  title: string;
  placeholder?: string;
}

const AddItemModal = ({ isOpen, onClose, onAdd, title, placeholder }: AddItemModalProps) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setName('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onAdd(name.trim());
      onClose();
    } catch (error) {
      console.error(error);
      alert('追加に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-black p-6 rounded-lg shadow-lg w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded mb-4"
            disabled={isSubmitting}
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-700 dark:text-gray-200"
              disabled={isSubmitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-700 text-white font-bold"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? '追加中...' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AddItemModal;
