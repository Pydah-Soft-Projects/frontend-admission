'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communicationAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface WhatsAppConversation {
  id: string;
  lead_id: string | null;
  contact_number: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
  status: string;
  lead_name?: string;
  lead_enquiry_number?: string;
}

interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  whatsapp_message_id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string;
  status: string;
  sent_by_name?: string;
  sent_at: string;
}

export default function WhatsAppChatPage() {
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Set Header
  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">WhatsApp Live Chat</h1>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  // Fetch Conversations
  const { data: convData, isLoading: isLoadingConvs } = useQuery({
    queryKey: ['whatsapp_conversations'],
    queryFn: async () => {
      const res = await communicationAPI.getWhatsAppConversations();
      return res.data || [];
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const conversations = (convData || []) as WhatsAppConversation[];

  // Fetch Messages for selected conversation
  const { data: msgData, isLoading: isLoadingMsgs } = useQuery({
    queryKey: ['whatsapp_messages', selectedConvId],
    queryFn: async () => {
      if (!selectedConvId) return [];
      const res = await communicationAPI.getWhatsAppMessages(selectedConvId);
      return res.data || [];
    },
    enabled: !!selectedConvId,
    refetchInterval: 3000, // Poll active chat every 3 seconds
  });

  const messages = (msgData || []) as WhatsAppMessage[];

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reply Mutation
  const replyMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      return await communicationAPI.sendWhatsAppChatReply(id, text);
    },
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['whatsapp_messages', selectedConvId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp_conversations'] });
    },
    onError: (err: any) => {
      showToast.error(err.message || 'Failed to send message');
    }
  });

  const handleSend = () => {
    if (!selectedConvId || !replyText.trim()) return;
    replyMutation.mutate({ id: selectedConvId, text: replyText.trim() });
  };

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
      {/* Sidebar: Conversation List */}
      <div className="w-80 sm:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <Input 
            placeholder="Search conversations..." 
            className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoadingConvs ? (
            <div className="p-8 text-center text-slate-400 animate-pulse">Loading chats...</div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-slate-500 text-sm">No conversations found</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "w-full p-4 flex items-start gap-3 transition-all hover:bg-white dark:hover:bg-slate-800 text-left border-b border-slate-100 dark:border-slate-800/50",
                  selectedConvId === conv.id ? "bg-white dark:bg-slate-800 shadow-sm z-10" : ""
                )}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-lg shrink-0">
                    {conv.lead_name?.charAt(0) || conv.contact_number.slice(-1)}
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-sm animate-bounce">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-bold text-slate-900 dark:text-white truncate">
                      {conv.lead_name || conv.contact_number}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {format(new Date(conv.last_message_at), 'HH:mm')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate line-clamp-1 italic">
                    {conv.last_message_preview || 'No messages yet'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Area: Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950/20 relative">
        {selectedConvId ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold">
                  {selectedConv?.lead_name?.charAt(0) || selectedConv?.contact_number.slice(-1)}
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white">
                    {selectedConv?.lead_name || selectedConv?.contact_number}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Online Status Protected</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" className="text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar pattern-bg"
            >
              {isLoadingMsgs ? (
                <div className="flex justify-center py-10 text-slate-400">Loading history...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 text-slate-400 italic">Start a conversation with {selectedConv?.lead_name || 'this contact'}</div>
              ) : (
                messages.map((msg, i) => {
                  const showDate = i === 0 || format(new Date(msg.sent_at), 'yyyy-MM-dd') !== format(new Date(messages[i-1].sent_at), 'yyyy-MM-dd');
                  return (
                    <div key={msg.id} className="space-y-4">
                      {showDate && (
                        <div className="flex justify-center my-6">
                          <span className="px-3 py-1 bg-slate-200/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded-full uppercase tracking-widest shadow-sm">
                            {format(new Date(msg.sent_at), 'MMMM dd, yyyy')}
                          </span>
                        </div>
                      )}
                      <div className={cn(
                        "flex w-full max-w-[85%] group",
                        msg.direction === 'outbound' ? "ml-auto justify-end" : "justify-start"
                      )}>
                        <div className={cn(
                          "relative px-4 py-2.5 rounded-2xl shadow-sm text-sm transition-all",
                          msg.direction === 'outbound' 
                            ? "bg-emerald-600 text-white rounded-tr-none" 
                            : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none border border-slate-100 dark:border-slate-700/50"
                        )}>
                          {msg.sent_by_name && msg.direction === 'outbound' && (
                            <p className="text-[9px] font-bold text-emerald-200 mb-1 uppercase tracking-tight">{msg.sent_by_name}</p>
                          )}
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1.5",
                            msg.direction === 'outbound' ? "text-emerald-200" : "text-slate-400"
                          )}>
                            <span className="text-[9px] font-medium uppercase">
                              {format(new Date(msg.sent_at), 'HH:mm')}
                            </span>
                            {msg.direction === 'outbound' && (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-20">
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner group-focus-within:border-emerald-500/50 transition-all">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-500 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-emerald-500 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </Button>
                <Input 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..." 
                  className="bg-transparent border-none focus:ring-0 text-sm h-10 placeholder:text-slate-400"
                />
                <Button 
                  onClick={handleSend}
                  disabled={!replyText.trim() || replyMutation.isPending}
                  className={cn(
                    "rounded-lg w-10 h-10 p-0 shadow-lg transition-all",
                    replyText.trim() ? "bg-emerald-600 hover:bg-emerald-700 text-white scale-100" : "bg-slate-200 text-slate-400 scale-95"
                  )}
                >
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="w-32 h-32 bg-emerald-50 dark:bg-emerald-900/10 rounded-full flex items-center justify-center text-emerald-500 mb-2 border-4 border-white dark:border-slate-800 shadow-xl">
              <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">WhatsApp Live Messaging</h2>
              <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">Select a conversation from the sidebar to start chatting with your leads in real-time.</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">End-to-End Encrypted Sync</span>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .pattern-bg {
          background-image: radial-gradient(circle at 1px 1px, rgba(16, 185, 129, 0.05) 1px, transparent 0);
          background-size: 24px 24px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.4);
        }
      `}</style>
    </div>
  );
}
