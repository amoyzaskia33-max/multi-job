import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { getApiBase, getEvents } from './api';

interface Event {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, any>;
}

export const useSSE = (enabled: boolean = true) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const bufferRef = useRef<Event[]>([]);

  // Initialize with recent events
  useEffect(() => {
    const loadInitialEvents = async () => {
      try {
        const initialEvents = await getEvents();
        bufferRef.current = initialEvents.slice(-200); // Keep last 200 events
        setEvents(bufferRef.current);
      } catch (err) {
        console.error('Failed to load initial events:', err);
      }
    };

    loadInitialEvents();
  }, []);

  // SSE connection
  useEffect(() => {
    if (!enabled) return;

    const connectSSE = () => {
      try {
        const url = `${getApiBase()}/events`;
        const eventSource = new EventSource(url);
        
        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const eventData = JSON.parse(event.data);
            const newEvent: Event = {
              id: eventData.id || Date.now().toString(),
              type: eventData.type || 'unknown',
              timestamp: eventData.timestamp || new Date().toISOString(),
              data: eventData.data || {},
            };
            
            bufferRef.current = [...bufferRef.current, newEvent].slice(-200);
            setEvents([...bufferRef.current]);
          } catch (parseError) {
            console.error('Failed to parse SSE event:', event.data, parseError);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE error:', error);
          setIsConnected(false);
          setError('Realtime terputus. Menggunakan polling sebagai cadangan.');
          toast.warning('Realtime terputus', {
            description: 'Menggunakan polling sebagai cadangan',
            duration: 5000,
          });
          
          // Try to reconnect after delay
          setTimeout(() => {
            if (eventSource.readyState === EventSource.CLOSED) {
              connectSSE();
            }
          }, 5000);
        };

        eventSourceRef.current = eventSource;
      } catch (err) {
        console.error('Failed to create EventSource:', err);
        setError('Gagal menghubungkan ke realtime. Menggunakan polling.');
        setIsConnected(false);
      }
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [enabled]);

  return {
    events: events.slice(-20), // Return last 20 events for display
    isConnected,
    error,
    refresh: () => {
      // Manual refresh - will be used for polling fallback
      getEvents().then(newEvents => {
        bufferRef.current = newEvents.slice(-200);
        setEvents([...bufferRef.current]);
      }).catch(err => {
        console.error('Refresh failed:', err);
      });
    }
  };
};
