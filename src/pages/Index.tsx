import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { useChat } from "@/hooks/useChat";

const Index = () => {
  const { messages, isLoading, sendMessage, clearChat, stopGeneration } =
    useChat();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full cinema-gradient">
        <AppSidebar
          messageCount={messages.length}
          onClearChat={clearChat}
          onSuggestionClick={sendMessage}
        />

        <div className="flex-1 flex flex-col min-h-screen">
          {/* Header */}
          <header className="flex h-12 items-center gap-2 border-b border-border px-3 bg-card/30 backdrop-blur-sm">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              CineBot — Movie RAG Chatbot
            </span>
          </header>

          {/* Chat */}
          <main className="flex-1 flex flex-col overflow-hidden">
            <ChatContainer
              messages={messages}
              isLoading={isLoading}
              onSend={sendMessage}
              onStop={stopGeneration}
            />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
