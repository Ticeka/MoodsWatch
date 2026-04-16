import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Users, Hash, Globe, TrendingUp, Swords,
  Loader2, AlertCircle, BarChart3,
} from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import {
  fetchPublicBattleDecks,
  fetchBattleCommunityRollup,
  incrementRemotePublicBattleDeckPlayCount,
  persistRemoteBattleSession,
} from '@/features/battle/api/battleRemoteApi';
import {
  createBattleSession,
  saveBattleSession,
} from '@/features/battle/lib/battleStore';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { PlayModeModal } from '@/shared/components/ui/PlayModeModal';
import '../styles/BattleDeckDetail.css';

/* ─── helpers ─── */
function formatCount(n) {
  if (!n) return '0';
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ─── Sub-components ─── */
function HeroBanner({ deck }) {
  const previews = (deck.titles || []).slice(0, 5);
  return (
    <div className="bdd-hero">
      <div className="bdd-hero-art">
        {previews.length > 0
          ? previews.map((t, i) => (
              <div key={t.id ?? i} className={`bdd-hero-tile bdd-hero-tile--${i}`}>
                <img src={getTitleArtwork(t)} alt="" loading="lazy" />
              </div>
            ))
          : <div className="bdd-hero-empty"><Swords size={48} strokeWidth={1} /></div>
        }
        <div className="bdd-hero-overlay" />
      </div>

      <div className="bdd-hero-info">
        <div className="bdd-hero-kicker"><Swords size={13} /> Battle Deck</div>
        <h1 className="bdd-hero-title">{deck.label || 'Untitled Deck'}</h1>
        <p className="bdd-hero-author">by {deck.ownerDisplayName || 'Community'}</p>

        <div className="bdd-hero-stats">
          <span className="bdd-stat"><Hash size={14} />{deck.titles?.length || 0} titles</span>
          {deck.playCount > 0 && <span className="bdd-stat"><Play size={14} />{formatCount(deck.playCount)} plays</span>}
          <span className="bdd-stat"><Globe size={14} />Public</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bdd-statcard">
      <Icon size={18} className="bdd-statcard-icon" />
      <div>
        <div className="bdd-statcard-value">{value}</div>
        <div className="bdd-statcard-label">{label}</div>
      </div>
    </div>
  );
}

function CommunityWinner({ rollup, deck }) {
  if (!rollup?.community_winner_title_id) return null;
  const winner = (deck.titles || []).find(t => t.id === rollup.community_winner_title_id);
  if (!winner) return null;

  return (
    <div className="bdd-winner">
      <div className="bdd-winner-label"><TrendingUp size={14} /> Community Favourite</div>
      <div className="bdd-winner-card">
        <img src={getTitleArtwork(winner)} alt={winner.canonical_title || ''} loading="lazy" />
        <div className="bdd-winner-info">
          <strong>{winner.canonical_title || winner.title_en || 'Unknown'}</strong>
          <span>{winner.type}</span>
        </div>
      </div>
    </div>
  );
}

function TitleGrid({ titles }) {
  if (!titles?.length) return null;
  return (
    <div className="bdd-title-grid">
      {titles.map((t, i) => (
        <div key={t.id ?? i} className="bdd-title-tile">
          <div className="bdd-title-img">
            <img src={getTitleArtwork(t)} alt={t.canonical_title || ''} loading="lazy" />
          </div>
          <p className="bdd-title-name">{t.canonical_title || t.title_en || '—'}</p>
          <p className="bdd-title-type">{t.type}</p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════════ */
export function BattleDeckDetailPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const { t } = useLanguage();

  const [deck, setDeck] = useState(null);
  const [rollup, setRollup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [showModeModal, setShowModeModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      // fetchPublicBattleDecks doesn't support filtering by id, load all then find
      const all = await fetchPublicBattleDecks({ limit: 96 });
      if (cancelled) return;

      const found = all.find(d => d.id === deckId);
      if (!found) { setError('Deck not found'); setLoading(false); return; }

      setDeck(found);

      // load rollup for community stats (non-blocking)
      if (found.fingerprint) {
        fetchBattleCommunityRollup(found.fingerprint)
          .then(r => { if (!cancelled) setRollup(r); })
          .catch(() => {});
      }

      setLoading(false);
    }

    load().catch(err => {
      if (!cancelled) { setError(err?.message || 'Failed to load deck'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [deckId]);

  const handleOpenModal = () => {
    if (!deck || (deck.titles?.length || 0) < 8) {
      toast.error('Need at least 8 titles to start a battle.');
      return;
    }
    setShowModeModal(true);
  };

  const handleStart = async () => {
    setShowModeModal(false);
    setStarting(true);
    try {
      if (deck.id) incrementRemotePublicBattleDeckPlayCount(deck.id);

      let session = saveBattleSession(createBattleSession(deck, {
        catalogCount: deck.titles.length,
        excludesAdultContent: !showAdult,
      }));

      if (user?.id) {
        try {
          session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
        } catch {
          toast.error('Saved locally — cloud sync failed.');
        }
      }
      navigate(`/battle/${session.id}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to start battle.');
      setStarting(false);
    }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="bdd-page">
        <div className="bdd-loading">
          <Loader2 size={28} className="animate-spin" />
          <p>Loading deck…</p>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error || !deck) {
    return (
      <div className="bdd-page">
        <div className="bdd-error">
          <AlertCircle size={28} />
          <p>{error || 'Deck not found'}</p>
          <button className="bdd-btn bdd-btn--ghost" onClick={() => navigate('/battle/browse')}>
            Back to Browse
          </button>
        </div>
      </div>
    );
  }

  const totalVotes = rollup?.total_vote_count || 0;
  const completedSessions = rollup?.completed_session_count || 0;

  return (
    <div className="bdd-page">

      {/* Back */}
      <div className="bdd-topbar container">
        <button className="bdd-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      {/* Hero */}
      <div className="container">
        <HeroBanner deck={deck} />
      </div>

      {/* Mode Modal */}
      <PlayModeModal
        isOpen={showModeModal}
        onClose={() => setShowModeModal(false)}
        onSolo={handleStart}
        onMulti={() => { setShowModeModal(false); navigate('/party'); }}
        title={deck.label || 'Battle Deck'}
        cover={getTitleArtwork(deck.titles?.[0])}
        multiLabel="Play with Friends"
        multiHint="Create a party room and battle together"
      />

      {/* CTA */}
      <div className="container bdd-cta-row">
        <button
          className="bdd-btn bdd-btn--primary"
          onClick={handleOpenModal}
          disabled={starting || (deck.titles?.length || 0) < 8}
        >
          {starting
            ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
            : <><Play size={16} /> Start Battle</>
          }
        </button>
        <button className="bdd-btn bdd-btn--ghost" onClick={() => navigate('/battle/build')}>
          <Swords size={16} /> Build Your Own
        </button>
      </div>

      {/* Stats row */}
      <div className="container bdd-stats-row">
        <StatCard icon={Hash} label="Titles" value={deck.titles?.length || 0} />
        <StatCard icon={Play} label="Plays" value={formatCount(deck.playCount)} />
        {totalVotes > 0 && <StatCard icon={BarChart3} label="Total Votes" value={formatCount(totalVotes)} />}
        {completedSessions > 0 && <StatCard icon={Users} label="Completed" value={formatCount(completedSessions)} />}
      </div>

      {/* Community winner */}
      {rollup && (
        <div className="container">
          <CommunityWinner rollup={rollup} deck={deck} />
        </div>
      )}

      {/* Title grid */}
      <div className="container bdd-section">
        <div className="bdd-section-head">
          <h2>All Titles <span className="bdd-count">{deck.titles?.length || 0}</span></h2>
        </div>
        <TitleGrid titles={deck.titles || []} />
      </div>

      {/* Meta footer */}
      <div className="container bdd-meta-footer">
        <span>Created {formatDate(deck.createdAt)}</span>
        {deck.updatedAt !== deck.createdAt && <span>· Updated {formatDate(deck.updatedAt)}</span>}
        {deck.ownerUsername && <span>· @{deck.ownerUsername}</span>}
      </div>

    </div>
  );
}

export default BattleDeckDetailPage;
