"use client";

import { useEffect, useRef, useState } from "react";
import { SHOP, hexDistance, withinReach } from "@mercatum/shared";
import { useCharacterBuild } from "../hooks/useCharacterBuild";
import { useMercatumRoom } from "../hooks/useMercatumRoom";
import { useTheme } from "../hooks/useTheme";
import { MarketHeader } from "../components/MarketHeader";
import { ExplorerColumn } from "../components/ExplorerColumn";
import { MarketMap } from "../components/MarketMap";
import { InventoryPanel } from "../components/InventoryPanel";
import { MarketActions } from "../components/MarketActions";
import { SectorNotes } from "../components/SectorNotes";
import { MarketBoard } from "../components/MarketBoard";
import { ProvenanceBoard } from "../components/ProvenanceBoard";
import { ExpeditionStatus } from "../components/ExpeditionStatus";
import { WorkspaceModal } from "../components/WorkspaceModal";
import { WorkspaceNavigation, type WorkspaceView } from "../components/WorkspaceNavigation";

type OverlayView = Exclude<WorkspaceView, "explore">;

const overlayMeta:Record<OverlayView,{title:string;subtitle:string}> = {
  character:{title:"Ficha del explorador",subtitle:"02 / REGISTRO PERSONAL"},
  inventory:{title:"Mochila y depósito",subtitle:"03 / INVENTARIO"},
  commerce:{title:"Comercio y trueque",subtitle:"04 / TRANSACCIONES"},
  registry:{title:"Archivo de procedencia",subtitle:"05 / REGISTRO EXTERIOR"},
};

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
    dropItem, reenter, sightings, latestClash,
    market, provenance, operateMarket, requestMarket, requestProvenance,
    chatMessages, chatPeers, chatPreferences, chatNotice,
    sendChat, chatPreference, reportChat,
  } = useMercatumRoom(committedBuild, draftStats, createSuccessor);

  // Keep the game surface and the Colyseus connection mounted while a modal
  // shows character, trade or archived paperwork. Only one can be open.
  const [activeModal, setActiveModal] = useState<OverlayView|null>(null);
  const [damagePulse,setDamagePulse]=useState(0);
  const previousHealth=useRef<number|null>(null);
  useEffect(()=>{
    const health=identity?.health??null;
    if(health!==null&&previousHealth.current!==null&&health<previousHealth.current&&
       (identity?.phase==="inside"||identity?.phase==="dead"))setDamagePulse(n=>n+1);
    previousHealth.current=health;
  },[identity?.health,identity?.phase]);
  const [commerceSection, setCommerceSection] = useState<"merchant"|"exchange">("merchant");
  const nearThreats=currentPosition
    ? sightings.filter(c=>hexDistance(currentPosition,c)<=2).length : 0;
  const nearShop=identity?.phase==="inside" && !!currentPosition &&
    withinReach(currentPosition,SHOP);
  const view:WorkspaceView = !committedBuild ? "character" : activeModal ?? "explore";
  const incomingOffers = market?.offers.filter(o=>o.direction==="incoming").length ?? 0;

  useEffect(()=>{
    // A death while browsing another dossier must expose the main death record.
    if(identity?.phase==="dead")setActiveModal(null);
  },[identity?.phase]);

  function navigate(destination:WorkspaceView) {
    if(!committedBuild)return;
    if(destination==="explore"){
      setActiveModal(null);
      return;
    }
    if(destination==="commerce"){
      setCommerceSection(identity?.phase==="outside"||nearShop?"merchant":"exchange");
      requestMarket();
    }
    setActiveModal(destination);
  }

  function openShop(){
    if(connection!=="online"||!nearShop)return;
    setCommerceSection("merchant");
    setActiveModal("commerce");
    requestMarket();
  }

  const explorerProps = {
    me, currentPosition, connection, committedBuild, draftStats,
    pointsLeft, adjustStat, setDraftStats, enterMarket,
    characterStats, movementDelayMs, marketTime,
  };

  return (
    <div className={"app-shell app-shell--organized app-shell--modal app-shell--redesign"+(committedBuild?" app-shell--playing":"")} data-theme={theme}>
      <div className="filth" aria-hidden="true" />
      <div className="screen-damage" aria-hidden="true" />
      {damagePulse>0&&<div key={damagePulse} className="hud-damage-pulse" aria-hidden="true"/>}
      <MarketHeader
        activeTheme={activeTheme} theme={theme} menuRef={themeMenuRef}
        onThemeChange={selectTheme} connection={connection} hasBuild={Boolean(committedBuild)}
      />
      <WorkspaceNavigation
        view={view} registered={Boolean(committedBuild)}
        incomingOffers={incomingOffers} onNavigate={navigate}
      />

      <main className="workspace-main" id="mercatum-content">
        {!committedBuild ? (
          <section className="workspace-route workspace-route--character" aria-label="Registro de personaje">
            <header className="workspace-route__heading">
              <div><span>02 / REGISTRO PERSONAL</span><h1>Ficha del <em>explorador.</em></h1></div>
              <p>Distribuye tus siete atributos para registrar un nuevo explorador.</p>
            </header>
            <div className="workspace-character">
              <ExplorerColumn {...explorerProps}/>
            </div>
          </section>
        ) : (
          <>
            <ExpeditionStatus identity={identity} position={currentPosition}
              time={marketTime} connection={connection} creatures={sightings}
              action={action} onNavigate={navigate}/>
            <section className="workspace-route" aria-label="Exploración activa">
              <div className="workspace-expedition">
                <div className="world-surface">
                <MarketMap
                  map={map} currentPosition={currentPosition} walkable={walkable}
                  requestMove={requestMove} players={players} playerId={playerId}
                  hasBuild={Boolean(committedBuild)} characterStats={characterStats}
                  cooldownRemaining={cooldownRemaining} recoveryPercentage={recoveryPercentage}
                  notice={notice} doorOpen={doorOpen} groundItems={groundItems} sightings={sightings}
                  latestClash={latestClash}
                  onOpenShop={openShop}
                />
                <MarketActions connection={connection} identity={identity} position={currentPosition}
                  groundItems={groundItems} doorOpen={doorOpen} onNewCharacter={prepareSuccessor}
                  action={action} clock={clock} requestAction={requestAction} cancelAction={cancelAction}
                  dropItem={dropItem} reenter={reenter}/>
                </div>
                <SectorNotes map={map} players={players} events={events}
                  identity={identity} sightings={sightings}
                  chatMessages={chatMessages} chatPeers={chatPeers}
                  chatPreferences={chatPreferences} chatNotice={chatNotice}
                  sendChat={sendChat} chatPreference={chatPreference} reportChat={reportChat}
                  actions={{connection,identity,position:currentPosition,groundItems,doorOpen,
                    onNewCharacter:prepareSuccessor,action,clock,requestAction,
                    cancelAction,dropItem,reenter}}
                />
              </div>
            </section>
          </>
        )}
      </main>

      {committedBuild && activeModal && (
        <WorkspaceModal key={activeModal}
          title={overlayMeta[activeModal].title}
          subtitle={overlayMeta[activeModal].subtitle}
          health={identity?.health??null}
          inside={identity?.phase==="inside"}
          sightings={identity?.phase==="inside"?nearThreats:0}
          onRequestClose={()=>setActiveModal(null)}>
          {activeModal==="character" && (
            <div className="workspace-character">
              <ExplorerColumn {...explorerProps}/>
            </div>
          )}
          {activeModal==="inventory" && <InventoryPanel identity={identity} strength={characterStats.strength}
            disabled={connection!=="online"||!!action} onDrop={dropItem}/>}
          {activeModal==="commerce" && (
            identity?.phase==="dead" ? (
              <div className="workspace-gate" role="status">
                <strong>EXPEDIENTE CERRADO</strong>
                <p>Un personaje fallecido no puede comerciar. Registra un sucesor desde el plano.</p>
                <button type="button" onClick={()=>setActiveModal(null)}>VOLVER AL PLANO</button>
              </div>
            ) : (
              <div className="workspace-commerce">
                <MarketBoard key={commerceSection} initialSection={commerceSection}
                  identity={identity} market={market}
                  operate={operateMarket} requestMarket={requestMarket}/>
              </div>
            )
          )}
          {activeModal==="registry" && (
            identity?.phase==="outside" ? (
              <div className="workspace-registry">
                <ProvenanceBoard identity={identity} market={market}
                  record={provenance} operate={operateMarket} inspect={requestProvenance}/>
              </div>
            ) : (
              <div className="workspace-gate">
                <strong>ARCHIVO INACCESIBLE</strong>
                <p>{identity?.phase==="dead"
                  ?"Este expediente ha sido cerrado. El siguiente explorador podrá consultar el archivo exterior."
                  :"La consulta de procedencia solo existe fuera del edificio. Vuelve a la entrada y completa una extracción."}</p>
                <button type="button" onClick={()=>setActiveModal(null)}>REGRESAR AL PLANO</button>
              </div>
            )
          )}
        </WorkspaceModal>
      )}

      <footer className="main-footer">
        <span>LA ORGANIZACIÓN / DOCUMENTO SIN GARANTÍAS</span>
        <span>MERCATUM — NO DEJAR EN EL INTERIOR DEL EDIFICIO</span>
      </footer>
    </div>
  );
}
