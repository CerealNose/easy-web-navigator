import { useState } from "react";
import { TabNav } from "@/components/TabNav";
import { LyricsAnalyzer } from "@/components/LyricsAnalyzer";
import { MoodImagePanel } from "@/components/MoodImagePanel";
import { TimestampPanel } from "@/components/TimestampPanel";
import { GenVidPanel } from "@/components/GenVidPanel";
import { Film, Github, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Theme {
  name: string;
  count: number;
  color: string;
}

interface Section {
  name: string;
  text: string;
}

interface SectionPrompt {
  section: string;
  prompt: string;
  narrativeBeat?: string;
}

interface Storyline {
  type: "literal" | "metaphorical" | "abstract";
  title: string;
  summary: string;
  protagonist: string;
  setting: string;
  emotionalArc: string;
  visualMotifs: string[];
  colorPalette?: string;
  cinematicStyle?: string;
}

interface Timestamp {
  time: string;
  text: string;
  start: number;
  end: number;
  section?: string;
}

const Index = () => {
  const [activeTab, setActiveTab] = useState("analyze");
  const [moodPrompt, setMoodPrompt] = useState("");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionPrompts, setSectionPrompts] = useState<SectionPrompt[]>([]);
  const [storyline, setStoryline] = useState<Storyline | undefined>();
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);

  const handleAnalyze = (prompt: string, detectedThemes: Theme[], detectedSections: Section[], detectedSectionPrompts: SectionPrompt[], detectedStoryline?: Storyline) => {
    setMoodPrompt(prompt);
    setThemes(detectedThemes);
    setSections(detectedSections);
    setSectionPrompts(detectedSectionPrompts);
    setStoryline(detectedStoryline);
    setActiveTab("mood");
  };

  const handleTimestampsGenerated = (generatedTimestamps: Timestamp[]) => {
    setTimestamps(generatedTimestamps);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse-glow">
              <Film className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg neon-text">LyricVision</h1>
              <p className="text-xs text-muted-foreground">Lyrics → Mood → Video</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Github className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Hero Section */}
          <section className="text-center space-y-4 py-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4 text-secondary" />
              AI-Powered Creative Workflow
            </div>
            <h2 className="text-4xl sm:text-5xl font-bold">
              Transform <span className="neon-text">Lyrics</span> into
              <br />
              Cinematic <span className="neon-text">Visuals</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Analyze song lyrics, generate mood-matched image prompts, and create
              perfectly synced video timestamps. All in one seamless workflow.
            </p>
          </section>

          {/* Tab Navigation */}
          <div className="flex justify-center">
            <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Tab Content */}
          <section className="py-4">
            {activeTab === "analyze" && (
              <LyricsAnalyzer onAnalyze={handleAnalyze} />
            )}
            {activeTab === "mood" && (
              <MoodImagePanel
                prompt={moodPrompt}
                themes={themes}
                onPromptChange={setMoodPrompt}
              />
            )}
            {activeTab === "timestamps" && (
              <TimestampPanel 
                sections={sections} 
                onTimestampsGenerated={handleTimestampsGenerated}
              />
            )}
            {activeTab === "genvid" && (
              <GenVidPanel sections={sections} timestamps={timestamps} moodPrompt={moodPrompt} sectionPrompts={sectionPrompts} storyline={storyline} />
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            Built for creators • Inspired by{" "}
            <span className="text-primary">neon city nights</span> and{" "}
            <span className="text-secondary">emotional soundscapes</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
