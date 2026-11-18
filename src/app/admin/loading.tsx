export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="后台页面正在加载">
      <div className="border-b border-rule pb-7">
        <div className="h-3 w-24 bg-rule/60" />
        <div className="mt-5 h-12 w-64 bg-rule/50" />
        <div className="mt-5 h-4 w-full max-w-[560px] bg-rule/35" />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[166px] border border-rule bg-paper p-6"
          >
            <div className="h-3 w-24 bg-rule/50" />
            <div className="mt-8 h-12 w-20 bg-rule/40" />
            <div className="mt-5 h-3 w-32 bg-rule/30" />
          </div>
        ))}
      </div>
    </div>
  );
}
