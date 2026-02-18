import os
import re

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define replacements
    # (Pattern, Replacement)
    # We use a negative lookahead (?!) to check if dark: is already there, but that's complex for all cases.
    # Instead, we'll replace and then cleanup.
    
    replacements = [
        (r'\bbg-white\b', 'bg-white dark:bg-black'),
        (r'\bbg-gray-50\b', 'bg-gray-50 dark:bg-gray-900'),
        (r'\bbg-gray-100\b', 'bg-gray-100 dark:bg-gray-800'),
        (r'\btext-gray-900\b', 'text-gray-900 dark:text-white'),
        (r'\btext-gray-800\b', 'text-gray-800 dark:text-gray-100'),
        (r'\btext-gray-700\b', 'text-gray-700 dark:text-gray-200'),
        (r'\btext-gray-600\b', 'text-gray-600 dark:text-gray-300'),
        (r'\btext-gray-500\b', 'text-gray-500 dark:text-gray-400'),
        (r'\bborder-gray-200\b', 'border-gray-200 dark:border-gray-700'),
        (r'\bborder-gray-300\b', 'border-gray-300 dark:border-gray-600'),
        (r'\bdivide-gray-200\b', 'divide-gray-200 dark:divide-gray-700'),
        # Fix potential duplicates if run multiple times or pre-existing
        (r'dark:bg-black dark:bg-black', 'dark:bg-black'),
        (r'dark:bg-black dark:bg-gray-800', 'dark:bg-black'), # Prefer black if collision
        (r'dark:bg-gray-800 dark:bg-black', 'dark:bg-black'),
        (r'dark:text-white dark:text-white', 'dark:text-white'),
        # Cleanup previously added manual styles in Header/ExpenseForm which might clash
        (r'dark:bg-gray-700', 'dark:bg-gray-800'), # Standardize to 800 for lighter gray backgrounds
        (r'dark:bg-gray-800 dark:bg-black', 'dark:bg-black'),
    ]

    new_content = content
    for pattern, replacement in replacements:
        # Regex substitution
        new_content = re.sub(pattern, replacement, new_content)
    
    # Fix the double replacement issue specifically:
    # If we replaced `bg-white` -> `bg-white dark:bg-black`, but it was `bg-white dark:bg-gray-800`
    # It becomes `bg-white dark:bg-black dark:bg-gray-800`.
    # We want to remove the `dark:bg-gray-800` or similar if `dark:bg-black` is present.
    
    # Simple deduplication strategy:
    # If `dark:bg-black` is present, remove other `dark:bg-*` in the same class string? No, too hard.
    # Just let CSS cascade handle it (last one wins), or basic cleanup.
    
    # Remove `dark:bg-gray-800` if `dark:bg-black` precedes it
    new_content = new_content.replace('dark:bg-black dark:bg-gray-800', 'dark:bg-black')
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def process_directory(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx'):
                update_file(os.path.join(root, file))

if __name__ == '__main__':
    process_directory('src')
