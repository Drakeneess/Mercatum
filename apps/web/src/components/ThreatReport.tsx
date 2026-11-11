import type {CreatureSighting, IdentityReply} from "@mercatum/shared";

interface ThreatReportProps {
  identity: IdentityReply|null;
  sightings: readonly CreatureSighting[];
}

/** Only reports entities already filtered by the server for this explorer. */
export function ThreatReport({identity,sightings}:ThreatReportProps){
  if(!identity)return null;
  const dead=identity.phase==="dead";
  return (
    <section className={"paper-piece threat-sheet"+(dead?" threat-sheet--dead":"")}
      aria-label="Estado físico y avistamientos">
      <div className="piece-meta"><span>PARTE MÉDICO / AVISTAMIENTOS</span><span>V2 / 04</span></div>
      <h3>{dead?"Sin pulso.":"La carne falla."}</h3>
      <div className="health-readout" role="status">
        <span>CONDICIÓN DEL EXPLORADOR</span>
        <strong>{identity.health} / 100</strong>
        <div className="health-track"><i style={{width:identity.health+"%"}} /></div>
        <small>HERIDAS REGISTRADAS: {identity.wounds} / 5</small>
      </div>
      {dead ? (
        <p className="threat-warning">FALLECIMIENTO CONFIRMADO. No habrá recuperación del personaje.</p>
      ) : identity.phase==="outside" ? (
        <p className="expedition-muted">Fuera del edificio. Las heridas se recuperan al iniciar la siguiente incursión.</p>
      ) : (
        <>
          <div className="expedition-subheading">AVISTAMIENTOS CONFIRMADOS</div>
          {sightings.length===0
            ? <p className="expedition-muted">Sin figuras visibles. Esto no confirma que el pasillo esté vacío.</p>
            : sightings.map(creature=><div className="threat-sighting" key={creature.id}>
                <strong>{creature.name}</strong>
                <small>ÚLTIMA OBSERVACIÓN / Q {creature.q} · R {creature.r}</small>
              </div>)}
          <p className="expedition-fineprint">Una figura fuera de vista no aparece en el registro.
            El silencio puede ocultar una presencia cercana.</p>
        </>
      )}
    </section>
  );
}
