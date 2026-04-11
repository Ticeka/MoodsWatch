import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { Globe, Layers, Lock, Sparkles, Trash2 } from 'lucide-react';
import {
  deleteStoredBattleDeck,
  getStoredBattleDecks,
  saveStoredBattleDeck,
} from '@/features/battle/lib/battleStore';
import {
  deleteRemotePublicBattleDeck,
  fetchMyPublicBattleDecks,
  persistRemotePublicBattleDeck,
} from '@/features/battle/api/battleRemoteApi';
import { BattleReadyDeckCard } from '@/features/battle/components/BattleReadyDeckCard';
import { getBattleDeckSubtitle } from '@/features/battle/lib/battleDeckPresentation';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterDecksForAgeGate } from '@/shared/lib/ageGate';
import '../styles/Battle.css';

export function BattleDeckLibraryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showAdult } = useAgeGate();
  const [savedDecks, setSavedDecks] = useState(() => getStoredBattleDecks());

  // Merge remote public decks (owned by this user) into local store on mount
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    fetchMyPublicBattleDecks(user.id).then((remoteDecks) => {
      if (cancelled) return;
      const localDecks = getStoredBattleDecks();
      const localIds = new Set(localDecks.map((d) => d.id));
      let changed = false;
      for (const remote of remoteDecks) {
        if (!localIds.has(remote.id)) {
          saveStoredBattleDeck(remote);
          changed = true;
        }
      }
      if (changed) setSavedDecks(getStoredBattleDecks());
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [user?.id]);

  const readySavedDecks = useMemo(
    () => filterDecksForAgeGate(
      savedDecks.filter((deck) => (deck?.titles?.length || 0) >= 8),
      showAdult
    ),
    [savedDecks, showAdult]
  );

  const privateDecks = useMemo(
    () => readySavedDecks.filter((deck) => !deck.isPublic),
    [readySavedDecks]
  );

  const publicDecks = useMemo(
    () => readySavedDecks.filter((deck) => deck.isPublic),
    [readySavedDecks]
  );

  const handleDeleteDeck = async (deck) => {
    if (!deck?.id) {
      return;
    }
    const confirmed = window.confirm(
      deck?.label
        ? `${t('battle.deleteDeck')} "${deck.label}"?`
        : `${t('battle.deleteDeck')}?`
    );
    if (!confirmed) {
      return;
    }

    if (deck.isPublic && user?.id) {
      try {
        await deleteRemotePublicBattleDeck(user.id, deck.id);
      } catch (deleteError) {
        console.warn('Failed to delete remote public battle deck', deleteError);
      }
    }

    deleteStoredBattleDeck(deck.id);
    setSavedDecks(getStoredBattleDecks());
  };

  const handleToggleDeckPublic = async (deck) => {
    if (!deck?.id) {
      return;
    }

    if (!deck.isPublic && !user?.id) {
      toast.error(t('battle.loginToPublishDeck'));
      return;
    }

    const nextDeck = saveStoredBattleDeck({
      ...deck,
      isPublic: !deck.isPublic,
    });

    try {
      if (nextDeck.isPublic && user?.id) {
        await persistRemotePublicBattleDeck(user, nextDeck);
      } else if (!nextDeck.isPublic && user?.id) {
        await deleteRemotePublicBattleDeck(user.id, nextDeck.id);
      }
    } catch (saveError) {
      console.warn('Failed to sync public battle deck', saveError);
      toast.error(t('battle.publishDeckFailed'));
      saveStoredBattleDeck(deck);
    }

    setSavedDecks(getStoredBattleDecks());
  };

  return (
    <div className="battle-page">
      <section className="battle-hero container battle-builder-hero">
        <div className="battle-hero-copy">
          <span className="battle-kicker"><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.myDeckLibrary')}</span>
          <h1><Sparkles size={18} style={{ display: 'inline', color: 'var(--primary-500)', verticalAlign: 'middle', marginRight: '0.28rem' }} /> {t('battle.myBuiltDecks')}</h1>
          <p>{t('battle.myDeckLibraryHint')}</p>
        </div>
        <div className="battle-hero-panel glass-heavy">
          <div className="battle-hero-stat">
            <strong>{readySavedDecks.length}</strong>
            <span><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.readyDecks')}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{privateDecks.length}</strong>
            <span><Lock size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.privateDeck')}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{publicDecks.length}</strong>
            <span><Globe size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.publicDeck')}</span>
          </div>
        </div>
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.privateDecks')}</h2>
          <p>{t('battle.privateDecksHint')}</p>
        </div>
        {privateDecks.length === 0 ? (
          <div className="glass-heavy battle-empty-state">
            <strong>{t('battle.noSavedCustomDeck')}</strong>
            <p>{t('battle.openBuilderHint')}</p>
            <div className="battle-hero-actions">
              <Link className="btn btn-primary" to="/battle/build">{t('battle.openBuilder')}</Link>
              <Link className="btn btn-secondary" to="/battle">{t('battle.backToBattle')}</Link>
            </div>
          </div>
        ) : (
          <div className="battle-deck-list-grid">
            {privateDecks.map((deck) => (
              <BattleReadyDeckCard
                key={deck.id}
                title={deck.label}
                subtitle={getBattleDeckSubtitle(deck, t)}
                deck={deck}
                badge={t('battle.customDeck')}
                className="battle-deck-card-compact"
                disabled={false}
                onStart={() => navigate('/battle')}
                actionLabel={t('battle.readyForPublish')}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleDeckPublic(deck)}
                  icon={<Globe size={14} />}
                >
                  {t('battle.makePublic')}
                </Button>
                <Link className="btn btn-secondary btn-sm" to={`/battle/build?deckId=${deck.id}`}>
                  {t('battle.editDeck')}
                </Link>
                <button type="button" className="battle-icon-btn" onClick={() => handleDeleteDeck(deck)} aria-label={t('battle.deleteDeck')}>
                  <Trash2 size={16} />
                </button>
              </BattleReadyDeckCard>
            ))}
          </div>
        )}
      </section>

      {publicDecks.length > 0 ? (
        <section className="container battle-section">
          <div className="battle-section-head">
            <h2>{t('battle.publicDecks')}</h2>
            <p>{t('battle.publicDecksManageHint')}</p>
          </div>
          <div className="battle-deck-list-grid">
            {publicDecks.map((deck) => (
              <div key={deck.id} className="battle-deck-preset-wrap">
                <BattleReadyDeckCard
                  title={deck.label}
                  subtitle={getBattleDeckSubtitle(deck, t)}
                  deck={deck}
                  badge={t('battle.publicDeck')}
                  className="battle-deck-card-compact"
                  disabled={false}
                  onStart={() => navigate('/battle')}
                  actionLabel={t('battle.visibleOnHub')}
                  variant="preset"
                />
                <div className="battle-deck-preset-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleDeckPublic(deck)}
                    icon={<Lock size={14} />}
                  >
                    {t('battle.makePrivate')}
                  </Button>
                  <Link className="btn btn-secondary btn-sm" to={`/battle/build?deckId=${deck.id}`}>
                    {t('battle.editDeck')}
                  </Link>
                  <button type="button" className="battle-icon-btn" onClick={() => handleDeleteDeck(deck)} aria-label={t('battle.deleteDeck')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default BattleDeckLibraryPage;
