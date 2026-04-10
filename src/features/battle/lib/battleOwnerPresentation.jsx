import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabase';

export function buildOwnerProfilePath(ownerUsername) {
  const normalized = String(ownerUsername || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return '';
  }
  return `/u/${normalized}`;
}

export function getOwnerLabel(deck) {
  return deck?.ownerDisplayName || deck?.ownerUsername || '';
}

export function getOwnerInitial(label) {
  return String(label || '?').trim().charAt(0).toUpperCase() || '?';
}

export function renderBattleDeckOwnerSubtitle(deck, t) {
  const ownerLabel = getOwnerLabel(deck);
  const ownerProfilePath = buildOwnerProfilePath(deck?.ownerUsername);

  if (!ownerLabel) {
    return t('battle.communityUserFallback');
  }

  if (!ownerProfilePath) {
    return t('battle.publicDeckBy', { owner: ownerLabel });
  }

  return (
    <Link
      to={ownerProfilePath}
      className="game-owner-link"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={t('battle.publicDeckBy', { owner: ownerLabel })}
    >
      <span className="game-owner-avatar">
        {deck.ownerAvatarUrl ? (
          <img src={deck.ownerAvatarUrl} alt="" loading="lazy" />
        ) : (
          <span>{getOwnerInitial(ownerLabel)}</span>
        )}
      </span>
      {ownerLabel}
    </Link>
  );
}

export async function enrichPublicDeckOwners(decks = []) {
  if (!supabase || !decks.length) return decks;

  const ownerIds = [...new Set(decks.map((deck) => String(deck?.ownerUserId || '').trim()).filter(Boolean))];
  if (!ownerIds.length) return decks;

  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, username, name, avatar_url')
      .in('id', ownerIds);

    if (error) throw error;

    if (profiles?.length) {
      const profileMap = new Map(profiles.map((profile) => [String(profile.id), profile]));
      return decks.map((deck) => {
        const profile = profileMap.get(String(deck?.ownerUserId || ''));
        if (!profile) {
          return deck;
        }

        return {
          ...deck,
          ownerAvatarUrl: profile.avatar_url || deck.ownerAvatarUrl || '',
          ownerUsername: profile.username || deck.ownerUsername || '',
          ownerDisplayName: profile.name || deck.ownerDisplayName || profile.username || '',
        };
      });
    }
  } catch (err) {
    console.error('Failed to fetch public deck owners', err);
  }

  return decks;
}
