import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownToLine, ChevronDown, Clapperboard, Eye, FastForward, MessageSquare, Play, SkipForward, Timer, Volume2, VolumeX } from 'lucide-react';
import {
  submitPartyTierlistVote,
  submitPartyTierlistSkipVote,
  applyPartyTierlistHostOverride,
} from '@/features/party/api/partyRemoteApi';
import { resumePartyAudioContext } from '@/features/party/lib/partyAudio';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import { PartyLobbyView } from '../pages/PartyLobby';
import { DEFAULT_TIERLIST_ROWS } from '../lib/partyModeTierlist';
import { PartyLiveChat } from './PartyLiveChat';
import { PartyYouTubePlayer } from './PartyYouTubePlayer';
import {
  REACTION_EMOJIS,
  getCurrentTierlistItem,
  getPhaseLabel,
  getTierlistMediaOffsetSec,
  getTierlistSkipVoteState,
  isYouTubeTierlistItem,
  usePhaseTimer,
} from './partyTierlistRoomUtils';
import { usePartyTierlistPlayerExperience } from './usePartyTierlistPlayerExperience';
import { readPartyAudioVolume } from '../lib/partyRoomUtils';
import './PartyTierlistRoom.css';

function TierlistSharedBoard({
  match,
  pick,
  highlightItemId = '',
  compact = false,
  showCurrentLane = true,
  animateItemId = '',
}) {
  const tierRows = match?.tierRows || [];
  const allItems = match?.allItems || {};
  const currentItem = highlightItemId ? allItems[highlightItemId] : null;

  return (
    <div className={`party-tierlist-board-card${compact ? ' is-compact' : ''}`}>
      <div className="party-tierlist-board-head">
        <div>
          <strong>{pick('กระดานกลางของห้อง', 'Shared room board')}</strong>
          <span>{pick('ทุกคนเห็นบอร์ดเดียวกันแบบเรียลไทม์', 'Everyone sees the same shared board in real time')}</span>
        </div>
      </div>

      {currentItem && showCurrentLane ? (
        <div className="party-tierlist-current-lane">
          <div className="party-tierlist-current-label">{pick('กำลังพิจารณา', 'Now considering')}</div>
          <div className="party-tierlist-current-card">
            {currentItem.imageUrl ? (
              <img
                className="party-tierlist-final-item"
                src={currentItem.imageUrl}
                alt={currentItem.title}
                draggable={false}
              />
            ) : (
              <div className="party-tierlist-final-item party-tierlist-final-item--text">{currentItem.title}</div>
            )}
            <div className="party-tierlist-current-copy">
              <strong>{currentItem.title}</strong>
              {currentItem.subtitle ? <span>{currentItem.subtitle}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="party-tierlist-final">
        {tierRows.map((row) => (
          <div
            key={row.id || row.label}
            className={`party-tierlist-final-row${animateItemId && (row.itemIds || []).includes(animateItemId) ? ' is-recent-placement' : ''}`}
          >
            <div className="party-tierlist-final-tier-label" style={{ background: row.color }}>
              {row.label}
            </div>
            <div className="party-tierlist-final-items">
              {(row.itemIds || []).map((itemId) => {
                const item = allItems[itemId];
                const placement = match?.placements?.[itemId] || {};
                if (!item) return null;

                return (
                  <div
                    key={itemId}
                    className={`party-tierlist-ranked-item${animateItemId && itemId === animateItemId ? ' is-new-placement' : ''}`}
                    title={`${item.title}${placement?.rankingScore ? ` • ${pick('คะแนนจัดอันดับ', 'Ranking score')} ${Math.round(placement.rankingScore)}` : ''}`}
                  >
                    <span className="party-tierlist-rank-badge">#{(row.itemIds || []).indexOf(itemId) + 1}</span>
                    {item.imageUrl ? (
                      <img
                        className="party-tierlist-final-item"
                        src={item.imageUrl}
                        alt={item.title}
                        draggable={false}
                      />
                    ) : (
                      <div className="party-tierlist-final-item party-tierlist-final-item--text">
                        {item.title}
                      </div>
                    )}
                    <span className="party-tierlist-score-badge">
                      {placement?.hostOverridden
                        ? pick('โฮสต์วางเอง', 'Host placed')
                        : `${pick('คะแนน', 'Score')} ${Math.round(Number(placement?.rankingScore || 0))}`}
                    </span>
                  </div>
                );
              })}

              {(!row.itemIds || row.itemIds.length === 0) ? (
                <span className="party-tierlist-empty-slot">{pick('ยังว่าง', 'Empty')}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TierlistMediaStage({
  item,
  match,
  audioEnabled,
  immersive = false,
  onToggleAudio,
  onVolumeChange,
  pick,
  volume = readPartyAudioVolume(),
}) {
  const videoRef = useRef(null);
  const seekOffsetSec = getTierlistMediaOffsetSec(match);
  const isYouTube = isYouTubeTierlistItem(item);
  const directVideoUrl = String(item?.mediaUrl || '').trim();
  const shouldPlay = match?.phase === 'show-item';
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !directVideoUrl) {
      return undefined;
    }

    const syncPlayback = () => {
      const maxSeek = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(video.duration - 0.25, seekOffsetSec)
        : seekOffsetSec;

      if (maxSeek > 0 && Math.abs(video.currentTime - maxSeek) > 1.1) {
        try {
          video.currentTime = maxSeek;
        } catch {
          return;
        }
      }

      video.volume = Math.min(1, Math.max(0, volume / 100));
      video.muted = !audioEnabled;

      if (shouldPlay) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => null);
        }
      } else {
        video.pause();
      }
    };

    syncPlayback();
    video.addEventListener('loadedmetadata', syncPlayback);
    return () => {
      video.removeEventListener('loadedmetadata', syncPlayback);
    };
  }, [audioEnabled, directVideoUrl, seekOffsetSec, shouldPlay, volume]);

  if (!item?.isVideo && !directVideoUrl && !isYouTube) {
    return (
      <div className={`party-tierlist-stage-empty${immersive ? ' is-immersive' : ''}`}>
        <Eye size={18} />
        <span>{pick('ไอเทมนี้ไม่มีคลิป ใช้ภาพใหญ่ตรงกลางเพื่อช่วยกันตัดสิน', 'This item has no clip. Use the large center artwork to decide together.')}</span>
      </div>
    );
  }

  return (
    <div className={`party-tierlist-media-card${immersive ? ' is-immersive' : ''}`}>
      <div className="party-tierlist-media-head">
        <span className="party-tierlist-media-chip">
          <Clapperboard size={14} />
          {pick('ห้องกำลังดูคลิปพร้อมกัน', 'The room is watching together')}
        </span>
        {typeof onToggleAudio === 'function' ? (
          <button
            type="button"
            className={`party-tierlist-audio-btn${audioEnabled ? ' is-on' : ''}`}
            onClick={onToggleAudio}
          >
            {audioEnabled ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {audioEnabled
              ? pick('ปิดเสียงห้อง', 'Mute room audio')
              : pick('เปิดเสียงห้อง', 'Unmute room audio')}
          </button>
        ) : audioEnabled ? (
          <span className="party-tierlist-media-note">{pick('เสียงห้องเปิดแล้ว', 'Room audio is on')}</span>
        ) : null}
      </div>

      <div className="party-tierlist-media-frame">
        {isYouTube ? (
          <PartyYouTubePlayer
            videoId={item.providerMediaId}
            playing={shouldPlay}
            seekOffsetSec={seekOffsetSec}
            muted={!audioEnabled}
            volume={volume}
            allowPointerEvents={false}
            className="party-tierlist-yt-frame"
          />
        ) : (
          <div className="party-tierlist-video-shell">
            <video
              ref={videoRef}
              className="party-tierlist-video"
              src={directVideoUrl}
              playsInline
              preload="auto"
              muted={!audioEnabled}
            />
          </div>
        )}

        {typeof onVolumeChange === 'function' ? (
          <label className="party-tierlist-media-volume-control">
            <Volume2 size={16} />
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              onChange={onVolumeChange}
              aria-label={pick('ปรับเสียงคลิป', 'Adjust clip volume')}
            />
            <span>{volume}%</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function TierlistReactionBurstLayer({ reactionFeed, bottom = '6rem' }) {
  if (!Array.isArray(reactionFeed) || reactionFeed.length === 0) {
    return null;
  }

  return (
    <div className="party-emoji-float-layer" aria-hidden="true">
      {reactionFeed.map((item) => (
        <span
          key={item.id}
          className="party-emoji-float"
          style={{ left: `${item.x}%`, bottom }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}

function TierlistReactionDock({ onReaction, pick, floating = false }) {
  if (typeof onReaction !== 'function') {
    return null;
  }

  return (
    <div className={`party-reaction-bar${floating ? ' party-tierlist-reaction-dock' : ''}`} aria-label={pick('ส่ง reaction', 'Send reaction')}>
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="party-reaction-btn"
          onClick={() => {
            void resumePartyAudioContext();
            onReaction(emoji);
          }}
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function TierlistSkipRequestButton({
  room,
  currentMember,
  match,
  pick,
}) {
  const [submitting, setSubmitting] = useState(false);
  const skipVoteState = useMemo(() => getTierlistSkipVoteState(match), [match]);
  const memberToken = String(currentMember?.member_token || '');
  const hasRequestedSkip = skipVoteState.memberTokens.includes(memberToken);
  const voteCount = skipVoteState.memberTokens.length;
  const requiredVotes = skipVoteState.requiredVotes;

  const handleRequestSkip = useCallback(async () => {
    if (submitting || !currentMember || !match?.currentVote?.roundId || hasRequestedSkip) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitPartyTierlistSkipVote({
        room,
        member: currentMember,
        roundId: match.currentVote.roundId,
      });

      if (!result) {
        return;
      }

      if (result.alreadyVoted) {
        toast(pick('คุณขอข้ามไอเทมนี้ไปแล้ว', 'You already requested to skip this item.'));
      } else {
        toast.success(pick(
          `ส่งคำขอข้ามแล้ว (${result.votes}/${result.requiredVotes})`,
          `Skip request sent (${result.votes}/${result.requiredVotes})`,
        ));
      }
    } catch (error) {
      toast.error(error?.message || pick('ส่งคำขอข้ามไม่สำเร็จ', 'Could not send the skip request.'));
    } finally {
      setSubmitting(false);
    }
  }, [currentMember, hasRequestedSkip, match?.currentVote?.roundId, pick, room, submitting]);

  if (match?.phase !== 'show-item' || !currentMember) {
    return null;
  }

  return (
    <div className="party-tierlist-skip-request">
      <div className="party-tierlist-skip-request-copy">
        <strong>{pick('อยากข้ามไอเทมนี้?', 'Want to skip this item?')}</strong>
        <span>
          {pick(
            `ส่งให้โฮสต์ตัดสินใจ${requiredVotes ? ` · ${voteCount}/${requiredVotes}` : ''}`,
            `Send a request for the host to review${requiredVotes ? ` · ${voteCount}/${requiredVotes}` : ''}`,
          )}
        </span>
      </div>
      <button
        type="button"
        className="party-tierlist-skip-request-btn"
        disabled={submitting || hasRequestedSkip}
        onClick={handleRequestSkip}
      >
        {hasRequestedSkip
          ? pick('ส่งคำขอแล้ว', 'Request sent')
          : submitting
            ? pick('กำลังส่ง...', 'Sending...')
            : pick('โหวตข้าม', 'Vote to skip')}
      </button>
    </div>
  );
}

function TierlistVoteOverlay({
  match,
  room,
  member,
  secondsLeft,
  pick,
}) {
  const [selectedTier, setSelectedTier] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tierRows = match?.tierRows || DEFAULT_TIERLIST_ROWS;
  const item = getCurrentTierlistItem(match);
  const roundId = match?.currentVote?.roundId;
  const totalSec = match?.settings?.voteSec || 12;
  const timerRatio = totalSec > 0 ? Math.max(0, secondsLeft / totalSec) : 0;

  useEffect(() => {
    setSelectedTier(null);
    setIsSubmitting(false);
  }, [item?.id, roundId]);

  const handleVote = useCallback(async (tierLabel) => {
    if (isSubmitting || selectedTier) {
      return;
    }

    setSelectedTier(tierLabel);
    setIsSubmitting(true);
    try {
      await submitPartyTierlistVote({
        room,
        member,
        roundId,
        selectedTierLabel: tierLabel,
      });
    } catch (err) {
      toast.error(err?.message || 'Vote failed');
      setSelectedTier(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, member, room, roundId, selectedTier]);

  if (!item) {
    return null;
  }

  return (
    <div className="party-tierlist-vote-overlay">
      <div className="party-tierlist-vote-backdrop" />
      <div className="party-tierlist-vote-modal">
        <div className="party-tierlist-vote-kicker">{pick('กำลังโหวต', 'Vote now')}</div>
        <h2>{pick('ไอเทมนี้ควรอยู่ tier ไหน?', 'Which tier does this belong in?')}</h2>
        <div className="party-tierlist-vote-focus">
          {item.imageUrl ? (
            <img
              className="party-tierlist-vote-focus-image"
              src={item.imageUrl}
              alt={item.title}
              draggable={false}
            />
          ) : null}
          <div className="party-tierlist-vote-focus-copy">
            <strong>{item.title}</strong>
            {item.subtitle ? <span>{item.subtitle}</span> : null}
          </div>
        </div>

        <div className="party-tierlist-vote-timer-copy">
          <strong>{secondsLeft}s</strong>
          <span>{pick('เหลือเวลาโหวต', 'left to vote')}</span>
        </div>
        <div className="party-tierlist-timer is-overlay">
          <div
            className={`party-tierlist-timer-bar${secondsLeft <= 3 ? ' urgent' : ''}`}
            style={{ width: `${timerRatio * 100}%` }}
          />
        </div>

        <div className="party-tierlist-vote-grid is-overlay">
          {tierRows.map((row) => (
            <button
              key={row.id || row.label}
              className={`party-tierlist-vote-btn${selectedTier === row.label ? ' selected' : ''}`}
              style={{ background: row.color }}
              disabled={Boolean(selectedTier) || isSubmitting}
              onClick={() => handleVote(row.label)}
            >
              {row.label}
            </button>
          ))}
        </div>

        <div className="party-tierlist-vote-copy is-overlay">
          {selectedTier
            ? pick(`ส่งโหวตแล้ว: ${selectedTier}`, `Vote locked: ${selectedTier}`)
            : pick('แตะเลือก tier ได้เลย คะแนนรอบนี้จะเฉลยพร้อมกัน', 'Tap a tier now. The room result reveals together.')}
        </div>
      </div>
    </div>
  );
}

function TierlistBoardPeek({ match, onOpenBoard, pick }) {
  const tierRows = match?.tierRows || [];

  return (
    <button type="button" className="party-tierlist-board-peek" onClick={onOpenBoard}>
      <div className="party-tierlist-board-peek-copy">
        <strong>{pick('ดูภาพรวมกระดานตอนนี้', 'See the live board')}</strong>
        <span>{pick('เลื่อนลงไปที่กระดานกลางของห้องได้ทันที', 'Jump straight to the shared room board')}</span>
      </div>
      <div className="party-tierlist-board-peek-rows" aria-hidden="true">
        {tierRows.map((row) => (
          <span key={row.label} style={{ background: row.color }}>
            {row.label} {Array.isArray(row.itemIds) ? row.itemIds.length : 0}
          </span>
        ))}
      </div>
      <ChevronDown size={18} />
    </button>
  );
}

function TierlistRevealShowcase({
  match,
  pick,
}) {
  const currentItem = getCurrentTierlistItem(match);

  return (
    <section className="party-tierlist-reveal-showcase">
      <div className="party-tierlist-reveal-board">
        <div className="party-tierlist-reveal-showcase-head">
          <strong>{pick('อัปเดตกระดานรอบนี้แล้ว', 'Board updated for this round')}</strong>
          <span>{pick('ดูตำแหน่งใหม่บนกระดานได้เลย ไอเทมที่เพิ่งลงจะขยับเด่นขึ้นอัตโนมัติ', 'Read the updated board directly. The newest item animates into place automatically.')}</span>
        </div>
        <TierlistSharedBoard
          match={match}
          pick={pick}
          highlightItemId={currentItem?.id || ''}
          animateItemId={currentItem?.id || ''}
          showCurrentLane={false}
        />
      </div>
    </section>
  );
}

function TierlistHostControls({ room, match, pick }) {
  const [busy, setBusy] = useState(null);
  const phase = match?.phase;
  const tierRows = match?.tierRows || [];
  const item = getCurrentTierlistItem(match);
  const hasMediaStage = Boolean(item?.isVideo || item?.mediaUrl || item?.providerMediaId);
  const skipVoteState = useMemo(() => getTierlistSkipVoteState(match), [match]);
  const members = usePartyRoomStore((state) => state.members);
  const skipRequesterNames = useMemo(
    () => skipVoteState.memberTokens.map((token) => (
      members.find((member) => String(member?.member_token || '') === token)?.display_name
        || members.find((member) => String(member?.member_token || '') === token)?.member_name
        || token
    )),
    [members, skipVoteState.memberTokens],
  );

  const handleOverride = useCallback(async (override) => {
    if (busy) {
      return;
    }

    setBusy(override.action);
    try {
      await applyPartyTierlistHostOverride({ room, override });
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  }, [busy, room]);

  if (phase === 'final' || phase === 'lobby') {
    return null;
  }

  return (
    <div className="party-tierlist-host-controls">
      {phase === 'show-item' && skipVoteState.memberTokens.length > 0 ? (
        <div className="party-tierlist-host-skip-summary">
          <strong>{pick('มีคนขอข้ามไอเทมนี้', 'Players want to skip this item')}</strong>
          <span>
            {pick(
              `${skipVoteState.memberTokens.length}/${skipVoteState.requiredVotes || 0} เสียง ส่งถึงโฮสต์แล้ว`,
              `${skipVoteState.memberTokens.length}/${skipVoteState.requiredVotes || 0} requests received`,
            )}
          </span>
          {skipRequesterNames.length > 0 ? (
            <span>
              {pick(
                `จาก ${skipRequesterNames.join(', ')}`,
                `From ${skipRequesterNames.join(', ')}`,
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      {phase === 'countdown' ? (
        <button
          className="party-tierlist-host-btn"
          disabled={Boolean(busy)}
          onClick={() => handleOverride({ action: 'advance' })}
        >
          <Play size={14} />
          {pick(hasMediaStage ? 'เริ่มช่วงดูคลิป' : 'เริ่มดูไอเทม', hasMediaStage ? 'Start viewing clip' : 'Start item view')}
        </button>
      ) : null}

      {phase === 'show-item' ? (
        <button
          className="party-tierlist-host-btn"
          disabled={Boolean(busy)}
          onClick={() => handleOverride({ action: 'advance' })}
        >
          <FastForward size={14} />
          {pick('เปิดโหวตให้ห้อง', 'Open voting for the room')}
        </button>
      ) : null}

      {phase === 'vote' ? (
        <>
          <button
            className="party-tierlist-host-btn"
            disabled={Boolean(busy)}
            onClick={() => handleOverride({ action: 'advance' })}
          >
            <Eye size={14} />
            {pick('เฉลยผลตอนนี้', 'Reveal now')}
          </button>
          <button
            className="party-tierlist-host-btn"
            disabled={Boolean(busy)}
            onClick={() => handleOverride({ action: 'extend', extendSec: 10 })}
          >
            <Timer size={14} />
            {pick('+10 วินาที', '+10s')}
          </button>
        </>
      ) : null}

      {phase === 'reveal' ? (
        <button
          className="party-tierlist-host-btn"
          disabled={Boolean(busy)}
          onClick={() => handleOverride({ action: 'advance' })}
        >
          <SkipForward size={14} />
          {pick('ไอเทมถัดไป', 'Next item')}
        </button>
      ) : null}

      {(phase === 'countdown' || phase === 'show-item' || phase === 'vote') ? (
        <button
          className="party-tierlist-host-btn danger"
          disabled={Boolean(busy)}
          onClick={() => handleOverride({ action: 'skip' })}
        >
          <SkipForward size={14} />
          {pick('ข้ามไอเทมนี้', 'Skip this item')}
        </button>
      ) : null}

      {(phase === 'show-item' || phase === 'vote') ? (
        <>
          {tierRows.map((row) => (
            <button
              key={row.label}
              className="party-tierlist-host-btn"
              style={{ borderColor: `${row.color}88` }}
              disabled={Boolean(busy)}
              onClick={() => handleOverride({ action: 'place', tierLabel: row.label })}
            >
              <ArrowDownToLine size={14} />
              {pick(`วาง ${row.label}`, `Place ${row.label}`)}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}

function HostTierlistExperience({ room, match, secondsLeft, isHost, pick, onRematch, reactionFeed }) {
  const currentItem = getCurrentTierlistItem(match);

  if (match?.phase === 'reveal') {
    return (
      <div className="party-tierlist-stage-grid party-tierlist-host-shell">
        <TierlistReactionBurstLayer reactionFeed={reactionFeed} bottom="8rem" />
        <div className="party-tierlist-stage-column party-tierlist-stage-column--full">
          <TierlistRevealShowcase
            match={match}
            pick={pick}
          />
          {isHost ? <TierlistHostControls room={room} match={match} pick={pick} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="party-tierlist-stage-grid party-tierlist-host-shell">
      <TierlistReactionBurstLayer reactionFeed={reactionFeed} bottom="8rem" />
      <div className="party-tierlist-stage-column">
        <div className="party-tierlist-stage-card">
          {currentItem ? (
            <>
              <div className="party-tierlist-stage-art">
                {currentItem.imageUrl ? (
                  <img className="party-tierlist-item-image" src={currentItem.imageUrl} alt={currentItem.title} draggable={false} />
                ) : (
                  <div className="party-tierlist-item-image party-tierlist-item-image--fallback">{currentItem.title.slice(0, 1) || '?'}</div>
                )}
              </div>
              <div className="party-tierlist-stage-copy">
                <strong>{currentItem.title}</strong>
                {currentItem.subtitle ? <span>{currentItem.subtitle}</span> : null}
                <span>{getPhaseLabel(match?.phase, pick)}</span>
                {match?.phase !== 'final' && secondsLeft > 0 ? <span>{pick(`เหลือ ${secondsLeft} วินาที`, `${secondsLeft}s remaining`)}</span> : null}
              </div>
            </>
          ) : (
            <div className="party-tierlist-stage-copy">
              <strong>{pick('กระดานสุดท้าย', 'Final board')}</strong>
            </div>
          )}
        </div>

        {match?.phase === 'show-item' ? (
          <TierlistMediaStage
            item={currentItem}
            match={match}
            audioEnabled={Boolean(isHost)}
            immersive={false}
            pick={pick}
          />
        ) : null}

        {isHost ? <TierlistHostControls room={room} match={match} pick={pick} /> : null}
        {match?.phase === 'final' && isHost ? (
          <div className="party-tierlist-host-controls">
            <button className="party-tierlist-host-btn" onClick={onRematch}>
              <Play size={14} />
              {pick('เล่นอีกรอบ', 'Play again')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="party-tierlist-board-column">
        <TierlistSharedBoard
          match={match}
          pick={pick}
          highlightItemId={match?.phase === 'final' ? '' : currentItem?.id || ''}
        />
      </div>
    </div>
  );
}

function PlayerTierlistExperience({
  room,
  currentMember,
  match,
  secondsLeft,
  reactionFeed,
  onReaction,
  pick,
}) {
  const {
    audioEnabled,
    boardRef,
    chatScopeKey,
    currentItem,
    handleToggleAudio,
    handleOpenBoard,
    handleReactionWithAudio,
    handleSendChatMessage,
    handleVolumeChange,
    heroRef,
    playerVolume,
    visibleChatMessages,
  } = usePartyTierlistPlayerExperience({
    room,
    currentMember,
    match,
    onReaction,
    pick,
  });

  return (
    <div className="party-tierlist-player-shell">
      <TierlistReactionBurstLayer reactionFeed={reactionFeed} />

      {match?.phase === 'reveal' ? (
        <>
          <TierlistRevealShowcase
            match={match}
            pick={pick}
          />
        </>
      ) : null}

      {match?.phase !== 'reveal' ? (
      <div ref={heroRef} className={`party-tierlist-player-hero${match?.phase === 'reveal' ? ' is-reveal-phase' : ''}`}>
        <div className="party-tierlist-player-head">
          <div className="party-tierlist-player-head-main">
            <span className="party-tierlist-player-kicker">{getPhaseLabel(match?.phase, pick)}</span>
          </div>
          {match?.phase !== 'final' && secondsLeft > 0 ? (
            <div className="party-tierlist-player-clock">
              <strong>{secondsLeft}</strong>
              <span>{pick('วินาที', 'sec')}</span>
            </div>
          ) : null}
        </div>

        <div className="party-tierlist-player-stage">
          {currentItem ? (
            <>
              <div className="party-tierlist-player-copy">
                <h2>{currentItem.title}</h2>
                {currentItem.subtitle ? <p>{currentItem.subtitle}</p> : null}
              </div>

              {match?.phase === 'show-item' ? (
                <TierlistMediaStage
                  item={currentItem}
                  match={match}
                  audioEnabled={audioEnabled}
                  immersive
                  onToggleAudio={handleToggleAudio}
                  onVolumeChange={handleVolumeChange}
                  pick={pick}
                  volume={playerVolume}
                />
              ) : (
                <div className="party-tierlist-player-art">
                  {currentItem.imageUrl ? (
                    <img src={currentItem.imageUrl} alt={currentItem.title} draggable={false} />
                  ) : (
                    <div className="party-tierlist-item-image party-tierlist-item-image--fallback">{currentItem.title.slice(0, 1) || '?'}</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="party-tierlist-player-copy">
              <h2>{pick('สรุปกระดานทั้งห้อง', 'Room board complete')}</h2>
            </div>
          )}

          {match?.phase === 'show-item' ? (
            <TierlistReactionDock onReaction={handleReactionWithAudio} pick={pick} floating />
          ) : null}
        </div>
      </div>
      ) : null}

      {match?.phase !== 'reveal' ? (
        <TierlistBoardPeek match={match} onOpenBoard={handleOpenBoard} pick={pick} />
      ) : null}

      {match?.phase !== 'reveal' ? (
        <TierlistSkipRequestButton
          room={room}
          currentMember={currentMember}
          match={match}
          pick={pick}
        />
      ) : null}

      {chatScopeKey && match?.phase !== 'reveal' ? (
        <div className="party-tierlist-player-chat-shell">
          <div className="party-tierlist-player-chat-head">
            <strong>
              <MessageSquare size={16} />
              {pick('คุยกับเพื่อนในห้อง', 'Room chat')}
            </strong>
            <span>{pick('ส่ง reaction หรือเมนต์สั้นๆ ระหว่างรอบนี้ได้เลย', 'Send reactions or short comments during this round')}</span>
          </div>
          <PartyLiveChat
            messages={visibleChatMessages}
            onSendMessage={handleSendChatMessage}
          />
        </div>
      ) : null}

      {match?.phase !== 'reveal' ? (
      <div
        ref={boardRef}
        className={`party-tierlist-player-board-shell${match?.phase === 'vote' ? ' is-underlay' : ''}${match?.phase === 'reveal' ? ' is-reveal-focus' : ''}`}
      >
        <TierlistSharedBoard
          match={match}
          pick={pick}
          highlightItemId={match?.phase === 'final' ? '' : currentItem?.id || ''}
          compact={match?.phase !== 'final'}
        />
      </div>
      ) : null}
    </div>
  );
}

function CurrentMemberVoteOverlay({ room, currentMember, match, secondsLeft, pick }) {
  if (!currentMember || match?.phase !== 'vote') {
    return null;
  }

  return (
    <TierlistVoteOverlay
      room={room}
      member={currentMember}
      match={match}
      secondsLeft={secondsLeft}
      pick={pick}
    />
  );
}

export function PartyTierlistRoomView({
  room,
  currentMember,
  isHost,
  pick,
  guestToken,
  partyProfile,
  busyAction,
  onToggleReady,
  onCloseRoom,
  onRematch,
  onStartMatch,
  hostEditor,
  reactionFeed,
  onReaction,
}) {
  const match = room?.current_match || null;
  const phase = match?.phase || 'lobby';
  const secondsLeft = usePhaseTimer(match);

  const currentPreset = useMemo(() => ({
    id: 'tierlist',
    label: 'Tierlist Vote',
    labelTh: 'Tierlist โหวต',
    description: 'Vote together on where each item belongs in the tier list.',
    descriptionTh: 'โหวตร่วมกันว่าแต่ละไอเทมควรอยู่ tier ไหน',
  }), []);
  const selectedPoolName = room?.settings?.tierlistTemplateName || room?.settings?.templateName || 'Tierlist';
  const selectedPoolNameTh = selectedPoolName;

  if (phase === 'lobby' || !match) {
    return (
      <PartyLobbyView
        room={room}
        guestToken={guestToken}
        partyProfile={partyProfile}
        currentPreset={currentPreset}
        selectedPoolName={selectedPoolName}
        selectedPoolNameTh={selectedPoolNameTh}
        currentMember={currentMember}
        isHost={isHost}
        busyAction={busyAction}
        onToggleReady={onToggleReady}
        onStartMatch={onStartMatch}
        onCloseRoom={onCloseRoom}
        hostEditor={hostEditor}
        pick={pick}
      />
    );
  }

  if (isHost) {
    return (
      <HostTierlistExperience
        room={room}
        match={match}
        secondsLeft={secondsLeft}
        isHost={isHost}
        pick={pick}
        onRematch={onRematch}
        reactionFeed={reactionFeed}
      />
    );
  }

  return (
    <>
      <PlayerTierlistExperience
        room={room}
        currentMember={currentMember}
        match={match}
        secondsLeft={secondsLeft}
        reactionFeed={reactionFeed}
        onReaction={onReaction}
        pick={pick}
      />
      <CurrentMemberVoteOverlay
        room={room}
        currentMember={currentMember}
        match={match}
        secondsLeft={secondsLeft}
        pick={pick}
      />
    </>
  );
}
