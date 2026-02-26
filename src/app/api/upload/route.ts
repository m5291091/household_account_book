import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'ファイルがありません' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 日本語ファイル名などが問題にならないようサフィックスを付けて安全な名前に
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // 拡張子を取得
    const ext = file.name.split('.').pop() || '';
    const finalFilename = `${uniqueSuffix}.${ext}`;

    const uploadDir = join(process.cwd(), 'public', 'uploads');
    
    // public/uploads フォルダが存在しない場合は作成
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const filepath = join(uploadDir, finalFilename);
    await writeFile(filepath, buffer);

    // フロントエンドからアクセスできるURLを返す
    const url = `/uploads/${finalFilename}`;

    return NextResponse.json({ success: true, url });
  } catch (e: any) {
    console.error('Upload error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
