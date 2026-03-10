import { useEffect, useState } from "react";
import {
  Film,
  Trash2,
  Database,
  Cpu,
  MessageSquare,
  CircleDot,
  Info,
  HardDrive,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { checkStatus, seedMovies } from "@/lib/chat-api";
import type { AppStatus } from "@/lib/types";
import { toast } from "sonner";

interface AppSidebarProps {
  messageCount: number;
  onClearChat: () => void;
  onSuggestionClick: (text: string) => void;
}

const EXAMPLES = [
  "What is Inception about?",
  "Compare The Godfather and Goodfellas",
  "Which movies won Best Picture?",
  "What themes does Parasite explore?",
  "Who directed The Dark Knight?",
  "Recommend me a sci-fi movie",
];

export function AppSidebar({
  messageCount,
  onClearChat,
  onSuggestionClick,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [status, setStatus] = useState<AppStatus>({
    status: "loading",
    tmdb_connected: false,
    ai_connected: false,
  });
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    checkStatus().then(setStatus);
  }, []);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const result = await seedMovies(55);
      toast.success(result.message);
      // Refresh status
      const newStatus = await checkStatus();
      setStatus(newStatus);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Seeding failed");
    } finally {
      setIsSeeding(false);
    }
  };

  if (collapsed) {
    return (
      <Sidebar collapsible="icon">
        <SidebarContent className="items-center py-4">
          <Film className="h-6 w-6 text-primary" />
        </SidebarContent>
      </Sidebar>
    );
  }

  const docCount = status.vector_db?.documents || 0;
  const chunkCount = status.vector_db?.chunks || 0;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 gold-glow">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-foreground">
              CineBot
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Movie RAG Assistant
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Status */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            System Status
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-2 px-2">
              <StatusRow
                icon={<HardDrive className="h-3.5 w-3.5" />}
                label="Vector DB"
                connected={docCount > 0}
                detail={`${docCount} docs / ${chunkCount} chunks`}
              />
              <StatusRow
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="AI Engine"
                connected={status.ai_connected}
              />
              <StatusRow
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Memory"
                connected
                detail={`${messageCount} msgs`}
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="mx-4 w-auto" />

        {/* Actions */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Actions
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearChat}
                  className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear Chat
                </Button>
              </SidebarMenuItem>
              {docCount < 50 && (
                <SidebarMenuItem>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSeed}
                    disabled={isSeeding}
                    className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-primary"
                  >
                    {isSeeding ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Database className="h-3.5 w-3.5" />
                    )}
                    {isSeeding ? "Seeding..." : "Seed Movie Database"}
                  </Button>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="mx-4 w-auto" />

        {/* Suggestions */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Try Asking
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="space-y-1 px-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => onSuggestionClick(ex)}
                  className="w-full rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  → {ex}
                </button>
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        <div className="flex items-start gap-2 rounded-lg bg-secondary/50 px-3 py-2.5">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Answers are grounded in retrieved sources via Multi-Query RAG
            with pgvector. {docCount} movie documents indexed.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function StatusRow({
  icon,
  label,
  connected,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  connected: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {detail && (
          <span className="text-[10px] text-muted-foreground">{detail}</span>
        )}
        <CircleDot
          className={`h-3 w-3 ${connected ? "text-green-500" : "text-destructive"}`}
        />
      </div>
    </div>
  );
}
