import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Track how many users are currently on a given "room" (page).
 * Uses Supabase Realtime presence over WebSocket.
 */
export function usePresence(room: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const channel = supabase.channel(`presence:${room}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  return count;
}
