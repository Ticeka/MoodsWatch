-- Enable Realtime replication for donate_sessions so frontend gets instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE donate_sessions;
