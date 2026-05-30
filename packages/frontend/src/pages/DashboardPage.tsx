import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { formatBytes, formatPairCode } from '@/lib/utils';
import { FileIcon, Clock, Loader2 } from 'lucide-react';

export function DashboardPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchTransfers(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchTransfers(session.user.id);
      } else {
        setTransfers([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTransfers = async (userId: string) => {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTransfers(data);
    }
    setLoading(false);
  };

  const handleSignIn = async () => {
    const email = prompt('Enter your email to sign in via magic link:');
    if (email) {
      await supabase.auth.signInWithOtp({ email });
      alert('Check your email for the login link!');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-vault-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
        <h2 className="mb-4 text-3xl font-bold text-surface-950">Your Dashboard</h2>
        <p className="mb-8 text-surface-600">Sign in to view your transfers and manage your account.</p>
        <button onClick={handleSignIn} className="btn-primary">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-surface-950">Dashboard</h1>
          <p className="text-surface-600">Manage your file transfers.</p>
        </div>
        <button onClick={handleSignOut} className="btn-secondary">
          Sign Out
        </button>
      </div>

      <div className="space-y-4">
        {transfers.length === 0 ? (
          <div className="card p-12 text-center text-surface-500">
            You haven't made any transfers yet.
          </div>
        ) : (
          transfers.map((transfer) => (
            <motion.div
              key={transfer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card flex flex-col justify-between p-6 sm:flex-row sm:items-center"
            >
              <div className="mb-4 sm:mb-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-surface-900">
                    {transfer.title || 'Untitled Transfer'}
                  </h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    transfer.status === 'ready' ? 'bg-accent-emerald/10 text-accent-emerald' :
                    transfer.status === 'expired' ? 'bg-accent-rose/10 text-accent-rose' :
                    'bg-surface-200 text-surface-700'
                  }`}>
                    {transfer.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-surface-500">
                  <span className="flex items-center gap-1"><FileIcon className="h-4 w-4"/> {transfer.file_count} files</span>
                  <span>{formatBytes(transfer.size_bytes)}</span>
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4"/> Expires {new Date(transfer.expires_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="pair-code text-lg">
                  {formatPairCode(transfer.pair_code)}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(transfer.pair_code);
                    alert('Pair code copied!');
                  }}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  Copy
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
