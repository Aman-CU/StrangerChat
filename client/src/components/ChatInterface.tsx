import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, SkipForward, Flag, Users } from "lucide-react";
import type { ChatMessage } from '@shared/schema';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onNextUser: () => void;
  onReportUser: () => void;
  statusMessage: string;
  isWaiting: boolean;
}

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  onNextUser, 
  onReportUser, 
  statusMessage,
  isWaiting
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Focus input when not waiting
  useEffect(() => {
    if (!isWaiting && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isWaiting]);

  const handleSendMessage = () => {
    if (inputValue.trim() && !isWaiting) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-2 md:p-4">
      <div className="w-full max-w-4xl mx-auto h-[calc(100vh-1rem)] md:h-[calc(100vh-2rem)] flex flex-col">
        
        {/* Header */}
        <Card className="bg-gray-800 border-gray-700 mb-2 md:mb-4">
          <CardHeader className="pb-2 md:pb-3 px-3 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                <h2 className="text-base md:text-lg font-semibold text-white" data-testid="title-chat">
                  Text Chat
                </h2>
                {!isWaiting && (
                  <span className="text-xs bg-green-600 px-2 py-1 rounded-full">
                    Connected
                  </span>
                )}
                {isWaiting && (
                  <span className="text-xs bg-yellow-600 px-2 py-1 rounded-full animate-pulse">
                    Waiting
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-1 md:space-x-2">
                <Button
                  onClick={onNextUser}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-1 bg-gray-700 border-gray-600 hover:bg-gray-600 text-xs md:text-sm"
                  data-testid="button-next"
              >
                <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
                <span>Next</span>
              </Button>
              <Button
                onClick={onReportUser}
                variant="outline"
                size="sm"
                className="flex items-center space-x-1 text-red-400 border-red-600 hover:bg-red-900/20 text-xs md:text-sm"
                disabled={isWaiting}
                data-testid="button-report"
              >
                <Flag className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Report</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0">
          {/* Status message */}
          {statusMessage && (
            <div className="p-2 md:p-3 bg-blue-900/50 border-b border-blue-700">
              <p className="text-xs md:text-sm text-blue-200 text-center" data-testid="text-chat-status">
                {statusMessage}
              </p>
            </div>
          )}

          {/* Messages area */}
          <ScrollArea className="flex-1 p-3 md:p-4" ref={scrollAreaRef} data-testid="area-messages">
            <div className="space-y-3 md:space-y-4">
              {messages.length === 0 && !isWaiting ? (
                <div className="text-center text-gray-400 mt-8">
                  <p className="text-sm md:text-base">Start a conversation with your new chat partner!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${message.id}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-3 md:px-4 py-2 rounded-lg text-sm ${
                        message.isOwn
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 border border-gray-600 text-gray-100'
                      }`}
                    >
                      <p className="break-words">{message.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          message.isOwn ? 'text-blue-100' : 'text-gray-300'
                        }`}
                      >
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-gray-700 bg-gray-800 p-3 md:p-4">
            <div className="flex space-x-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isWaiting ? "Waiting for partner..." : "Type your message..."}
                disabled={isWaiting}
                className="flex-1 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                maxLength={1000}
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isWaiting}
                size="icon"
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-send"
              >
                <Send className="h-3 w-3 md:h-4 md:w-4" />
              </Button>
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
              <span>Press Enter to send</span>
              <span>{inputValue.length}/1000</span>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
