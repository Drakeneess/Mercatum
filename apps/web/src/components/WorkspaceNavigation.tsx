"use client";

export type WorkspaceView = "explore" | "character" | "commerce" | "registry";

interface WorkspaceNavigationProps {
  view: WorkspaceView;
  registered: boolean;
  incomingOffers: number;
  onNavigate: (view: WorkspaceView) => void;
}

const routes: readonly {id:WorkspaceView;number:string;label:string;sub:string}[] = [
  {id:"explore",number:"01",label:"Explorar",sub:"Plano y acciones"},
  {id:"character",number:"02",label:"Personaje",sub:"Ficha y estado"},
  {id:"commerce",number:"03",label:"Comercio",sub:"Compras y trueque"},
  {id:"registry",number:"04",label:"Archivo",sub:"Procedencia pública"},
];

/** One destination at a time; none of these navigation actions changes game state. */
export function WorkspaceNavigation({view,registered,incomingOffers,onNavigate}:WorkspaceNavigationProps){
  return (
    <nav className="workspace-navigation" aria-label="Secciones de Mercatum">
      <div className="workspace-navigation__inner">
        {routes.map(route=>{
          const active=view===route.id;
          const disabled=!registered&&route.id!=="character";
          return <button type="button" key={route.id}
            className={"workspace-navigation__tab"+(active?" workspace-navigation__tab--current":"")}
            aria-current={active?"page":undefined}
            disabled={disabled}
            onClick={()=>onNavigate(route.id)}>
            <span className="workspace-navigation__index">{route.number} /</span>
            <span className="workspace-navigation__copy">
              <strong>{route.label}{route.id==="commerce"&&incomingOffers>0?" ("+incomingOffers+")":""}</strong>
              <small>{route.sub}</small>
            </span>
          </button>;
        })}
      </div>
    </nav>
  );
}
