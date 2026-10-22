import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  AppOutlet,
  BottomBar,
  HeroHost,
  Modal,
  SiteFooter,
  SiteHeader,
  Strips,
  Toast,
} from "../components/Layout.jsx";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import { useLegacyApp } from "../hooks/useLegacyApp.js";
import SiteLayout from "../layouts/SiteLayout.jsx";

/**
 * The CampusKart page. React Router owns the top-level URL; the preserved
 * renderer uses the original hash routes (`#/browse`, `#/item/I101`, ...).
 * On a deep link such as `/browse`, the path is translated once to the hash
 * route so bookmarks and Render SPA fallbacks keep working.
 */
export default function CampusKartPage() {
  const outletRef = useLegacyApp();
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path && path !== "/" && path !== "/index.html" && !window.location.hash) {
      window.location.hash = "#" + path + location.search;
    }
  }, [location.pathname, location.search]);

  return (
    <SiteLayout>
      <ErrorBoundary>
        <SiteHeader />
        <Strips />
        <HeroHost />
        <AppOutlet outletRef={outletRef} />
        <SiteFooter />
        <BottomBar />
        <Toast />
        <Modal />
      </ErrorBoundary>
    </SiteLayout>
  );
}
