import { TradingClock } from "@/components/tools/TradingClock";
import { TimezoneConverter } from "@/components/tools/TimerTools";
export default function Page() {
  return (
    <div className="space-y-4">
      <TradingClock full />
      <TimezoneConverter />
    </div>
  );
}
