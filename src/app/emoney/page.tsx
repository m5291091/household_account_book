import EmoneyManager from '@/components/emoney/EmoneyManager';

const EmoneyPage = () => {
  return (
    <div>
      <main className="pt-8 pb-32">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-8 text-gray-900 dark:text-white">電子マネー管理</h1>
          <EmoneyManager />
        </div>
      </main>
    </div>
  );
};

export default EmoneyPage;
