/**
 * The original CampusKart page is a set of fixed containers that the view layer
 * fills in. The React shell owns those containers; `AppOutlet` is the one the
 * router writes pages into. Keeping the same ids and markup means style.css and
 * every screen look exactly like the Java/JSP version.
 */
export function SiteHeader() {
  return <div id="header" />;
}

export function Strips() {
  return <div id="strips" />;
}

export function HeroHost() {
  return <div id="herohost" />;
}

export function AppOutlet({ outletRef }) {
  return (
    <main>
      <div className="wrap" id="app" ref={outletRef} />
    </main>
  );
}

export function SiteFooter() {
  return <footer className="foot" id="foot" />;
}

export function BottomBar() {
  return <nav className="bottombar" id="bottombar" aria-label="Mobile" />;
}

export function Toast() {
  return <div id="toast" className="toast" role="status" hidden />;
}

export function Modal() {
  return <div id="modal" hidden />;
}
