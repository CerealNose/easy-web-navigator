import { cn } from "@/lib/utils";
import { Music, Image, AudioLines } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
  emoji: string;
}

const tabs: Tab[] = [
  { id: "analyze", label: "Analyze Lyrics", icon: <Music className="w-5 h-5" />, emoji: "🎵" },
  { id: "mood", label: "Mood Image", icon: <Image className="w-5 h-5" />, emoji: "🎨" },
  { id: "timestamps", label: "Timestamps", icon: <AudioLines className="w-5 h-5" />, emoji: "🎤" },
];

interface TabNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="flex items-center gap-2 p-2 glass-card rounded-xl">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all duration-300",
            "hover:bg-muted/50",
            activeTab === tab.id
              ? "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_20px_hsl(280_100%_65%/0.2)]"
              : "text-muted-foreground hover:text-foreground"
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.emoji}</span>
        </button>
      ))}
    </nav>
  );
}
