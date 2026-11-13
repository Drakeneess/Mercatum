"use client";

import { useState } from "react";
import { useCharacterBuild } from "../hooks/useCharacterBuild";
import { useMercatumRoom } from "../hooks/useMercatumRoom";
import { useTheme } from "../hooks/useTheme";
import { MarketHeader } from "../components/MarketHeader";
import { ExplorerColumn } from "../components/ExplorerColumn";
import { MarketMap } from "../components/MarketMap";
import { SectorNotes } from "../components/SectorNotes";
import { MarketBoard } from "../components/MarketBoard";
import { ProvenanceBoard } from "../components/ProvenanceBoard";
import { ExpeditionStatus } from "../components/ExpeditionStatus";
import { WorkspaceNavigation, type WorkspaceView } from "../components/WorkspaceNavigation";

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
    identity, groundItems, doorOpen, action, clock, requestAction, cancelAction,
    dropItem, reenter, sightings,
    market, provenance, operateMarket, requestMarket, requestProvenance,
  } = useMercatumRoom(committedBuild, draftStats, createSuccessor);

  // Unregistered explorers see their intake form first. A signed form
  // returns them to the map without changing their live Colyseus session.
  const [selectedView, setSelectedView] = useState<WorkspaceView>("explore");
  const view:WorkspaceView = committedBuild ? selectedView : "character";
  const incomingOffers = market?.offers.filter(o=>o.direction==="incoming").length ?? 0;
  function navigate(destination:WorkspaceView) {
    if(!committedBuild && destination!=="character")return;
    setSelectedView(destination);
    if(destination==="commerce")requestMarket();
  }

  return (
    <div className="app-shell app-shell--organized" data-theme={theme}>
      <div className="filth" aria-hidden="true" />
      <div className="screen-damage" aria-hidden="true" />
      <MarketHeader
        activeTheme={activeTheme} theme={theme} menuRef={themeMenuRef}
        onThemeChange={selectTheme} connection={connection} hasBuild={Boolean(committedBuild)}
      />
      <WorkspaceNavigation
        view={view} registered={Boolean(committedBuild)}
        incomingOffers={incomingOffers} onNavigate={navigate}
      />

      <main className="workspace-main" id="mercatum-content">
        {view==="explore" && (
          <section className="workspace-route" aria-label="Exploración">
            <header className="workspace-route__heading">
              <div><span>01 / OPERACIONES DE INCURSIÓN</span><h1>Exploración <em>activa.</em></h1></div>
              <p>Muévete por las casillas vecinas. El Mercado no espera a que termines de leer.</p>
            </header>
            <ExpeditionStatus identity={identity} position={currentPosition}
              time={marketTime} connection={connection} creatures={sightings}
              action={action} onNavigate={navigate}/>
            <div className="workspace-expedition">
              <MarketMap
                map={map} currentPosition={currentPosition} walkable={walkable}
                requestMove={requestMove} players={players} playerId={playerId}
                hasBuild={Boolean(committedBuild)} characterStats={characterStats}
                cooldownRemaining={cooldownRemaining} recoveryPercentage={recoveryPercentage}
                notice={notice} doorOpen={doorOpen} groundItems={groundItems} sightings={sightings}
              />
              <SectorNotes map={map} players={players} events={events}
                identity={identity} sightings={sightings}
                actions={{connection,identity,position:currentPosition,groundItems,doorOpen,
                  onNewCharacter:prepareSuccessor,action,clock,requestAction,
                  cancelAction,dropItem,reenter}}
              />
            </div>
          </section>
        )}
        {view==="character" && (
          <section className="workspace-route workspace-route--character" aria-label="Ficha de personaje">
            <header className="workspace-route__heading">
              <div><span>02 / REGISTRO PERSONAL</span><h1>Ficha del <em>explorador.</em></h1></div>
              <p>{committedBuild?"Tu personaje sigue en el mundo mientras consultas sus datos.":
                "Distribuye tus siete atributos para registrar un nuevo explorador."}</p>
            </header>
            <div className="workspace-character">
              <ExplorerColumn
                me={me} currentPosition={currentPosition} connection={connection}
                committedBuild={committedBuild} draftStats={draftStats}
                pointsLeft={pointsLeft} adjustStat={adjustStat}
                setDraftStats={setDraftStats} enterMarket={enterMarket}
                characterStats={characterStats} movementDelayMs={movementDelayMs}
                marketTime={marketTime}
              />
            </div>
          </section>
        )}
        {view==="commerce" && (
          <section className="workspace-route workspace-route--commerce" aria-label="Comercio">
            <header className="workspace-route__heading">
              <div><span>03 / HOJA DE TRANSACCIONES</span><h1>Comprar. <em>Negociar.</em></h1></div>
              <p>El comerciante opera en el exterior. Los intercambios entre exploradores
                también funcionan a un hexágono de distancia dentro del Mercado.</p>
            </header>
            {identity?.phase==="dead" ? (
              <div className="workspace-gate" role="status">
                <strong>EXPEDIENTE CERRADO</strong>
                <p>Un personaje fallecido no puede comerciar. Registra un sucesor desde la vista de exploración.</p>
                <button type="button" onClick={()=>navigate("explore")}>VER EXPEDIENTE DE INCURSIÓN</button>
              </div>
            ) : (
              <div className="workspace-commerce">
                <MarketBoard identity={identity} market={market}
                  operate={operateMarket} requestMarket={requestMarket}/>
              </div>
            )}
          </section>
        )}
        {view==="registry" && (
          <section className="workspace-route workspace-route--registry" aria-label="Registro público">
            <header className="workspace-route__heading">
              <div><span>04 / ARCHIVO EXTERNO</span><h1>Hechos y <em>versiones.</em></h1></div>
              <p>El registro conserva hechos verificables y afirmaciones de jugadores. Que algo conste no significa que sea verdad.</p>
            </header>
            {identity?.phase==="outside" ? (
              <div className="workspace-registry">
                <ProvenanceBoard identity={identity} market={market}
                  record={provenance} operate={operateMarket} inspect={requestProvenance}/>
              </div>
            ) : (
              <div className="workspace-gate">
                <strong>ARCHIVO INACCESIBLE</strong>
                <p>{identity?.phase==="dead"
                  ?"Este expediente ha sido cerrado. El siguiente explorador podrá consultar el archivo exterior."
                  :"La consulta del historial público no está disponible desde el interior. Regresa al hexágono de entrada y completa una extracción para acceder."}</p>
                <button type="button" onClick={()=>navigate("explore")}>REGRESAR A EXPLORACIÓN</button>
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="main-footer">
        <span>LA ORGANIZACIÓN / DOCUMENTO SIN GARANTÍAS</span>
        <span>MERCATUM — NO DEJAR EN EL INTERIOR DEL EDIFICIO</span>
      </footer>
    </div>
  );
}
