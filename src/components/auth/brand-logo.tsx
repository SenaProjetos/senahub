export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/MARCA/logo_hub_v_dark.svg"
        alt="SenaHub"
        className={`hidden dark:block ${className ?? ""}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/MARCA/logo_hub_v_light.svg"
        alt="SenaHub"
        className={`dark:hidden ${className ?? ""}`}
      />
    </>
  );
}
