"use client";

import { useCharacterBuild } from "../hooks/useCharacterBuild";
import { useMercatumRoom } from "../hooks/useMercatumRoom";
import { useTheme } from "../hooks/useTheme";
import { MarketHeader } from "../components/MarketHeader";
import { ExplorerColumn } from "../components/ExplorerColumn";
import { MarketMap } from "../components/MarketMap";
import { SectorNotes } from "../components/SectorNotes";

export default function Home() {
  const { theme, activeTheme, themeMenuRef, selectTheme } = useTheme();
  const {
    draftStats, committedBuild, pointsLeft, adjustStat, enterMarket,
    setDraftStats, createSuccessor, prepareSuccessor,
  } = useCharacterBuild();
  const {
    connection, playerId, players, map, marketTime, notice, events, me,
    currentPosition, characterStats, movementDelayMs, cooldownRemaining,
    recoveryPercentage, walkable, requestMove,
    identity, groundItems, doorOpen, action, clock, requestAction, cancelAction, dropItem, reenter, sightings,
  } = useMercatumRoom(committedBuild, draftStats, createSuccessor);

  return (
    <div className="app-shell" data-theme={theme}>
      <div className="filth" aria-hidden="true" />
      <div className="screen-damage" aria-hidden="true" />
      <MarketHeader
        activeTheme={activeTheme} theme={theme} menuRef={themeMenuRef}
        onThemeChange={selectTheme} connection={connection} hasBuild={Boolean(committedBuild)}
      />
      <main className="game-layout">
        <ExplorerColumn
          me={me} currentPosition={currentPosition} connection={connection}
          committedBuild={committedBuild} draftStats={draftStats}
          pointsLeft={pointsLeft} adjustStat={adjustStat}
          setDraftStats={setDraftStats} enterMarket={enterMarket}
          characterStats={characterStats} movementDelayMs={movementDelayMs}
          marketTime={marketTime}
        />
        <MarketMap
          map={map} currentPosition={currentPosition} walkable={walkable}
          requestMove={requestMove} players={players} playerId={playerId}
          hasBuild={Boolean(committedBuild)} characterStats={characterStats}
          cooldownRemaining={cooldownRemaining} recoveryPercentage={recoveryPercentage}
          notice={notice} doorOpen={doorOpen} groundItems={groundItems} sightings={sightings}
        />
        <SectorNotes map={map} players={players} events={events}
          identity={committedBuild?identity:null} sightings={sightings}
          actions={{ connection, identity:committedBuild?identity:null, position:currentPosition, groundItems, doorOpen,
            onNewCharacter:prepareSuccessor,
            action, clock, requestAction, cancelAction, dropItem, reenter }}
        />
      </main>
      <footer className="main-footer">
        <span>LA ORGANIZACIÓN / DOCUMENTO SIN GARANTÍAS</span>
        <span>MERCATUM — NO DEJAR EN EL INTERIOR DEL EDIFICIO</span>
      </footer>
    </div>
  );
}
