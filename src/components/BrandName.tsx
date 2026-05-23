import { cn } from "@/lib/utils";

export const BRAND_PLAIN = "PiHLAI";

type BrandNameProps = {
  className?: string;
  aiClassName?: string;
};

export function BrandName({ className, aiClassName }: BrandNameProps) {
  return (
    <span className={cn("inline-flex items-baseline leading-none", className)}>
      <span>PiHL</span>
      <span className={cn("text-[0.62em] font-semibold tracking-wide", aiClassName)}>AI</span>
    </span>
  );
}
