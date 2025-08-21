import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Video } from "lucide-react";

interface LandingPageProps {
  onStartChat: () => void;
  onStartVideo: () => void;
  statusMessage: string;
  isConnecting: boolean;
}

export function LandingPage({ onStartChat, onStartVideo, statusMessage, isConnecting }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardContent className="p-8 text-center">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2" data-testid="title-stranger-chat">
              Stranger Chat
            </h1>
            <p className="text-gray-600 leading-relaxed" data-testid="text-description">
              Chat with a random stranger instantly — no sign up required.
            </p>
          </div>

          <div className="mb-6 space-y-3">
            <Button
              onClick={onStartChat}
              disabled={isConnecting}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
              data-testid="button-start-chat"
            >
              <MessageSquare className="h-5 w-5" />
              <span>{isConnecting ? 'Connecting...' : 'Start Text Chat'}</span>
            </Button>
            
            <Button
              onClick={onStartVideo}
              disabled={isConnecting}
              size="lg"
              variant="outline"
              className="w-full border-2 border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
              data-testid="button-start-video"
            >
              <Video className="h-5 w-5" />
              <span>{isConnecting ? 'Connecting...' : 'Start Video Chat'}</span>
            </Button>
          </div>

          {statusMessage && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800" data-testid="text-status">
                {statusMessage}
              </p>
            </div>
          )}

          <div className="mt-8 text-xs text-gray-500">
            <p>Please be respectful and follow community guidelines.</p>
            <p className="mt-1">Report inappropriate behavior using the report button.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
