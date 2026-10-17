import type { SVGProps } from "react";

/**
 * Farbige Artikel-Symbole (eigene Zeichnungen, liegen im Projekt – nichts wird geladen).
 * Der Vorrat wird einmal je Seite eingebunden (siehe app/layout.tsx); jedes Symbol verweist nur darauf.
 * So stehen die Bilder auch offline an der Theke sofort bereit.
 */
export function ArticleArtSprite() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <linearGradient id="vd-gGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6fbff" stopOpacity=".9"/><stop offset="1" stopColor="#cfe5f4" stopOpacity=".75"/></linearGradient>
        <linearGradient id="vd-gAmber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd84d"/><stop offset="1" stopColor="#f39200"/></linearGradient>
        <linearGradient id="vd-gHazy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffcb57"/><stop offset="1" stopColor="#e27d0c"/></linearGradient>
        <linearGradient id="vd-gFoam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#efe6d2"/></linearGradient>
        <linearGradient id="vd-gCola" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a4419"/><stop offset="1" stopColor="#2a0c03"/></linearGradient>
        <linearGradient id="vd-gWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ddf5ff"/><stop offset="1" stopColor="#59bdee"/></linearGradient>
        <linearGradient id="vd-gWine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e43d74"/><stop offset="1" stopColor="#730e31"/></linearGradient>
        <linearGradient id="vd-gShot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffbea"/><stop offset="1" stopColor="#f6d56e"/></linearGradient>
        <linearGradient id="vd-gCocktail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa36c"/><stop offset="1" stopColor="#ec407a"/></linearGradient>
        <linearGradient id="vd-gPorcelain" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#dbe5ee"/></linearGradient>
        <linearGradient id="vd-gCoffee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8e4d25"/><stop offset="1" stopColor="#3b1806"/></linearGradient>
        <linearGradient id="vd-gMilkBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6cb8ff"/><stop offset="1" stopColor="#2f7fe0"/></linearGradient>
        <linearGradient id="vd-gSausage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ec8a4c"/><stop offset="1" stopColor="#93380f"/></linearGradient>
        <linearGradient id="vd-gFish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fdbff"/><stop offset="1" stopColor="#1f6fd8"/></linearGradient>
        <linearGradient id="vd-gFishTail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#59afff"/><stop offset="1" stopColor="#1453b8"/></linearGradient>
        <linearGradient id="vd-gBun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f9cf7d"/><stop offset="1" stopColor="#c9781f"/></linearGradient>
        <linearGradient id="vd-gBunLow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#edb063"/><stop offset="1" stopColor="#b96a1c"/></linearGradient>
        <linearGradient id="vd-gCheese" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe36e"/><stop offset="1" stopColor="#f4b400"/></linearGradient>
        <linearGradient id="vd-gPatty" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#86441f"/><stop offset="1" stopColor="#45200b"/></linearGradient>
        <linearGradient id="vd-gChicken" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f8c463"/><stop offset="1" stopColor="#b4611b"/></linearGradient>
        <linearGradient id="vd-gCrust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#edb067"/><stop offset="1" stopColor="#b76a20"/></linearGradient>
        <linearGradient id="vd-gBowl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6bb4ff"/><stop offset="1" stopColor="#1e5ed0"/></linearGradient>
        <linearGradient id="vd-gSoup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffb648"/><stop offset="1" stopColor="#ee7411"/></linearGradient>
        <linearGradient id="vd-gSponge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f9cf8a"/><stop offset="1" stopColor="#e9a957"/></linearGradient>
        <linearGradient id="vd-gCream" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#fbe9f0"/></linearGradient>
        <linearGradient id="vd-gPink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa3c0"/><stop offset="1" stopColor="#f04e86"/></linearGradient>
        <linearGradient id="vd-gMint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b6f5da"/><stop offset="1" stopColor="#36be86"/></linearGradient>
        <linearGradient id="vd-gCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4c784"/><stop offset="1" stopColor="#c98431"/></linearGradient>
        <linearGradient id="vd-gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6b5e"/><stop offset="1" stopColor="#d3221f"/></linearGradient>
        <linearGradient id="vd-gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe680"/><stop offset="1" stopColor="#f0ac00"/></linearGradient>
        <linearGradient id="vd-gTicket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffc15a"/><stop offset="1" stopColor="#ff7518"/></linearGradient>
        <linearGradient id="vd-gCandy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d99bff"/><stop offset="1" stopColor="#7e2cc4"/></linearGradient>
        <linearGradient id="vd-gBoxTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3d09d"/><stop offset="1" stopColor="#e0ac6c"/></linearGradient>
        <linearGradient id="vd-gEmber" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffc107"/><stop offset="1" stopColor="#e53935"/></linearGradient>
        <clipPath id="vd-cCone"><path d="M21 31h22L32 60z"/></clipPath>
        <clipPath id="vd-cCandy"><ellipse cx="32" cy="32" rx="14.5" ry="11.5"/></clipPath>
        <symbol id="vd-art-beer" viewBox="0 0 64 64">
          <ellipse cx="30" cy="60" rx="18" ry="2.6" fill="#000" opacity=".13"/>
          <path d="M45 25h4.5a7 7 0 0 1 7 7v9a7 7 0 0 1-7 7H45v-5h4.5a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H45z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <rect x="11" y="17" width="35" height="41" rx="6" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <rect x="14.5" y="23" width="28" height="31.5" rx="3.5" fill="url(#vd-gAmber)"/>
          <g fill="#fff" opacity=".75"><circle cx="23" cy="45" r="1.5"/><circle cx="31" cy="39" r="1.1"/><circle cx="36.5" cy="48" r="1.6"/><circle cx="28" cy="51" r="1"/><circle cx="35" cy="31" r="1"/></g>
          <path d="M10 23.5c-.5-4.5 3-7.5 7-6.8 1.2-4 6-5.7 9.8-3.6 3-3 8.8-2.2 10.8 1.6 4-.4 7.4 2.8 6.8 7 0 2.4-1.8 4.3-4.6 4.3H14.4c-2.5 0-4.2-1.1-4.4-2.5z" fill="url(#vd-gFoam)" stroke="#ded1b5" strokeWidth="1.1"/>
          <path d="M18 25.5c0 4 1.6 6.5 3.2 6.5s3.2-2.5 3.2-6.5z" fill="#fffdf7"/>
          <rect x="17.5" y="32" width="3.4" height="19" rx="1.7" fill="#fff" opacity=".55"/>
        </symbol>
        <symbol id="vd-art-wheat-beer" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="12" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M23 59h18l-1-5c4.5-8 6.5-18 4.5-30-1-5.6-2.6-9-2.6-9H22.1s-1.6 3.4-2.6 9c-2 12 0 22 4.5 30z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <path d="M25.3 56h13.4l-.8-3.6c4-7.2 5.8-16.4 4.1-27H22c-1.7 10.6.1 19.8 4.1 27z" fill="url(#vd-gHazy)"/>
          <path d="M20.5 25c-1.4-5.6 2.2-10 6.4-9.6 1.6-3.6 8.6-3.6 10.2 0 4.2-.4 7.8 4 6.4 9.6z" fill="url(#vd-gFoam)" stroke="#ded1b5" strokeWidth="1.1"/>
          <g fill="#fff" opacity=".7"><circle cx="29" cy="44" r="1.3"/><circle cx="35" cy="36" r="1.1"/><circle cx="33" cy="50" r="1.4"/></g>
          <path d="M25.5 30c-.8 8 .2 15 2.4 21" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".5"/>
        </symbol>
        <symbol id="vd-art-soda" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="15" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M39 3.5 34 33" stroke="#ff4d5a" strokeWidth="4.2" strokeLinecap="round"/>
          <path d="M39 3.5 34 33" stroke="#fff" strokeWidth="4.2" strokeDasharray="3 3.4" opacity=".9"/>
          <path d="M13 15h38l-4.2 41.4a4 4 0 0 1-4 3.6H21.2a4 4 0 0 1-4-3.6z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <path d="M15.6 24h32.8l-3.3 32a2.4 2.4 0 0 1-2.4 2.2H21.3a2.4 2.4 0 0 1-2.4-2.2z" fill="url(#vd-gCola)"/>
          <rect x="19" y="20" width="11" height="11" rx="2.2" fill="#e3f6ff" opacity=".92" transform="rotate(-14 24.5 25.5)"/>
          <rect x="31.5" y="22.5" width="10" height="10" rx="2.2" fill="#e3f6ff" opacity=".82" transform="rotate(12 36.5 27.5)"/>
          <g fill="#fff" opacity=".55"><circle cx="26" cy="42" r="1.2"/><circle cx="37" cy="47" r="1.4"/><circle cx="31" cy="51" r="1"/></g>
          <path d="M19.5 33l2 19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".35"/>
        </symbol>
        <symbol id="vd-art-water" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="15" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M13 15h38l-4.2 41.4a4 4 0 0 1-4 3.6H21.2a4 4 0 0 1-4-3.6z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <path d="M15.8 26c5.4-2.4 10.8 2.4 16.2 0s10.8-2.4 16.2 0L45.1 56a2.4 2.4 0 0 1-2.4 2.2H21.3a2.4 2.4 0 0 1-2.4-2.2z" fill="url(#vd-gWater)"/>
          <g fill="#fff" opacity=".85"><circle cx="25" cy="40" r="1.4"/><circle cx="33" cy="47" r="1.1"/><circle cx="38" cy="36" r="1.6"/><circle cx="29" cy="52" r="1"/></g>
          <circle cx="46" cy="15" r="7.5" fill="#ffe14d" stroke="#f2c200" strokeWidth="1.5"/>
          <path d="M46 8.5v13M39.5 15h13M41.4 10.4l9.2 9.2M50.6 10.4l-9.2 9.2" stroke="#fff" strokeWidth="1.1" opacity=".85"/>
          <path d="M19.5 30l2 22" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".5"/>
        </symbol>
        <symbol id="vd-art-coffee" viewBox="0 0 64 64">
          <ellipse cx="32" cy="55" rx="25" ry="5.5" fill="url(#vd-gPorcelain)" stroke="#b9c7d4" strokeWidth="1.4"/>
          <path d="M47 30h3.5a6.5 6.5 0 0 1 0 13H46" fill="none" stroke="#b9c7d4" strokeWidth="5" strokeLinecap="round"/>
          <path d="M47 30h3.5a6.5 6.5 0 0 1 0 13H46" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
          <path d="M11 27h38v11a15 15 0 0 1-15 15h-8a15 15 0 0 1-15-15z" fill="url(#vd-gPorcelain)" stroke="#b9c7d4" strokeWidth="1.4"/>
          <rect x="11.7" y="33.5" width="36.6" height="3.4" fill="#ff9500"/>
          <ellipse cx="30" cy="27" rx="19" ry="4.2" fill="url(#vd-gCoffee)"/>
          <ellipse cx="28" cy="26.6" rx="10" ry="1.8" fill="#c98d5e" opacity=".65"/>
          <g fill="none" stroke="#b9c7d4" strokeWidth="2.6" strokeLinecap="round" opacity=".9"><path d="M23 19c-3-3 3-5 0-9"/><path d="M31 18c-3-3 3-6 0-11"/><path d="M39 19c-3-3 3-5 0-9"/></g>
          <path d="M16 40c1 5 3.6 8 7 9.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".9"/>
        </symbol>
        <symbol id="vd-art-wine" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="13" ry="2.2" fill="#000" opacity=".13"/>
          <ellipse cx="32" cy="58" rx="11.5" ry="2.6" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.4"/>
          <path d="M30.8 38h2.4v19.5h-2.4z" fill="#dcedf8" stroke="#9db4c6" strokeWidth="1.2"/>
          <path d="M17.5 7h29c1.2 10.5 1 18.6-3 24.6-3 4.4-7.2 6.6-11.5 6.6s-8.5-2.2-11.5-6.6c-4-6-4.2-14.1-3-24.6z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <path d="M19 18h26c-.2 5.8-1.2 9.8-3.5 13.2-2.6 3.8-6 5.4-9.5 5.4s-6.9-1.6-9.5-5.4C20.2 27.8 19.2 23.8 19 18z" fill="url(#vd-gWine)"/>
          <ellipse cx="32" cy="18" rx="13" ry="2" fill="#f37aa0" opacity=".75"/>
          <path d="M22 11c-.6 7 .4 13 3 17" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".6"/>
        </symbol>
        <symbol id="vd-art-shot" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="14" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M16.5 17h31l-3.6 37.6a4 4 0 0 1-4 3.6H24.1a4 4 0 0 1-4-3.6z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5"/>
          <path d="M18.6 27h26.8l-2.1 21H20.7z" fill="url(#vd-gShot)"/>
          <ellipse cx="32" cy="27" rx="13.4" ry="1.8" fill="#fff6c9"/>
          <path d="M20.6 48h22.8l-.7 6.3a2 2 0 0 1-2 1.8H23.3a2 2 0 0 1-2-1.8z" fill="#e6f3fb" opacity=".95"/>
          <path d="M21.5 22l2.3 23" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".55"/>
          <path d="M51 4l1.6 4.4L57 10l-4.4 1.6L51 16l-1.6-4.4L45 10l4.4-1.6z" fill="#ffc928"/>
          <path d="M10 8l1 2.6 2.6 1-2.6 1L10 15.2l-1-2.6-2.6-1 2.6-1z" fill="#ffc928" opacity=".8"/>
        </symbol>
        <symbol id="vd-art-cocktail" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="13" ry="2.2" fill="#000" opacity=".13"/>
          <ellipse cx="32" cy="58" rx="11.5" ry="2.6" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.4"/>
          <path d="M30.8 33h2.4v24.5h-2.4z" fill="#dcedf8" stroke="#9db4c6" strokeWidth="1.2"/>
          <path d="M22 3l11 21" stroke="#8d5a2b" strokeWidth="1.6" strokeLinecap="round"/>
          <path d="M8 11h48L32 35z" fill="url(#vd-gGlass)" stroke="#9db4c6" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M13.2 15h37.6L32 32.6z" fill="url(#vd-gCocktail)"/>
          <circle cx="30.5" cy="20" r="3.4" fill="#7cb342"/>
          <circle cx="49" cy="12" r="8" fill="#ffb547" stroke="#f28a0f" strokeWidth="1.5"/>
          <path d="M49 5v14M42 12h14M44 7l10 10M54 7 44 17" stroke="#fff" strokeWidth="1.1" opacity=".85"/>
          <path d="M15 14.5l10 11" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".55"/>
        </symbol>
        <symbol id="vd-art-milk" viewBox="0 0 64 64">
          <ellipse cx="32" cy="60.5" rx="16" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M18 23h28v35a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2z" fill="url(#vd-gPorcelain)" stroke="#b9c7d4" strokeWidth="1.4"/>
          <path d="M18 23l6-10h16l6 10z" fill="url(#vd-gMilkBlue)"/>
          <path d="M24 9h16v4H24z" fill="#2f7fe0"/>
          <rect x="18.7" y="29" width="26.6" height="17" fill="url(#vd-gMilkBlue)"/>
          <path d="M32 31.5c3 4 4.6 6.2 4.6 8.2a4.6 4.6 0 0 1-9.2 0c0-2 1.6-4.2 4.6-8.2z" fill="#fff"/>
          <path d="M21.5 49v7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".9"/>
        </symbol>
        <symbol id="vd-art-sausage" viewBox="0 0 64 64">
          <ellipse cx="32" cy="57" rx="22" ry="3" fill="#000" opacity=".13"/>
          <g transform="rotate(-18 32 34)">
            <rect x="6" y="26" width="52" height="16" rx="8" fill="url(#vd-gSausage)"/>
            <g stroke="#5e1c04" strokeWidth="2.6" strokeLinecap="round" opacity=".5"><path d="M19 28.5l3.5 11M29 28.5l3.5 11M39 28.5l3.5 11M49 28.5l3 9"/></g>
            <path d="M12 34c3-3 5 3 8 0s5 3 8 0 5 3 8 0 5 3 8 0 5 3 7 .5" fill="none" stroke="#ffd21f" strokeWidth="2.8" strokeLinecap="round"/>
            <rect x="13" y="28.5" width="34" height="2.6" rx="1.3" fill="#fff" opacity=".35"/>
          </g>
        </symbol>
        <symbol id="vd-art-fish" viewBox="0 0 64 64">
          <ellipse cx="30" cy="57" rx="20" ry="2.8" fill="#000" opacity=".13"/>
          <path d="M43 32l15-12v24z" fill="url(#vd-gFishTail)" strokeLinejoin="round"/>
          <path d="M22 20c3-6 10-8 15-5.5L34 22z" fill="#1f6fd8"/>
          <path d="M24 44c3 5 8 6 12 4l-4-5z" fill="#1f6fd8"/>
          <ellipse cx="27" cy="32" rx="20" ry="12.5" fill="url(#vd-gFish)"/>
          <path d="M13 37c6 4 18 5 28 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".35"/>
          <path d="M19 24c2.6 4.6 2.6 11.4 0 16" fill="none" stroke="#1453b8" strokeWidth="2" strokeLinecap="round" opacity=".55"/>
          <g fill="none" stroke="#fff" strokeWidth="1.4" opacity=".45"><path d="M27 27a3 3 0 0 1 0 6M32 27a3 3 0 0 1 0 6M37 28a3 3 0 0 1 0 5M29.5 31a3 3 0 0 1 0 6M34.5 31a3 3 0 0 1 0 6"/></g>
          <circle cx="13.5" cy="29" r="3.4" fill="#fff"/><circle cx="12.8" cy="29" r="1.7" fill="#0b1e3a"/>
          <path d="M7.6 33.5c1.2.8 2.6.8 3.6 0" fill="none" stroke="#0b1e3a" strokeWidth="1.4" strokeLinecap="round"/>
        </symbol>
        <symbol id="vd-art-sandwich" viewBox="0 0 64 64">
          <ellipse cx="32" cy="55" rx="25" ry="2.6" fill="#000" opacity=".13"/>
          <g transform="rotate(-12 32 36)">
            <path d="M5 38h54c0 6-6 11-14 11H19C11 49 5 44 5 38z" fill="url(#vd-gBunLow)"/>
            <path d="M4 37c3-3 5 2 8-1s5 2 8-1 5 2 8-1 5 2 8-1 5 2 8-1 5 2 8-1 3 1.6 4 .5V40H4z" fill="#5cc23a"/>
            <g fill="#e8546e" stroke="#c63a55" strokeWidth=".8"><ellipse cx="13" cy="34.6" rx="6.4" ry="3"/><ellipse cx="26" cy="34.2" rx="6.4" ry="3"/><ellipse cx="39" cy="34.2" rx="6.4" ry="3"/><ellipse cx="51.5" cy="34.6" rx="5.6" ry="2.7"/></g>
            <g fill="#f7a6b4" opacity=".9"><circle cx="12" cy="34" r=".9"/><circle cx="27" cy="33.6" r=".9"/><circle cx="40" cy="34.4" r=".8"/><circle cx="52" cy="34" r=".8"/></g>
            <path d="M5 32.5c0-8 11.5-13.5 27-13.5s27 5.5 27 13.5z" fill="url(#vd-gBun)"/>
            <g stroke="#a85f17" strokeWidth="2" strokeLinecap="round" opacity=".5" fill="none"><path d="M17 22.5l4 6M27 20.5l4 6.5M37 20.5l4 6.5M47 22.5l3.4 5.4"/></g>
            <ellipse cx="22" cy="23.5" rx="8" ry="2.2" fill="#fff" opacity=".35"/>
          </g>
        </symbol>
        <symbol id="vd-art-burger" viewBox="0 0 64 64">
          <ellipse cx="32" cy="59" rx="22" ry="2.6" fill="#000" opacity=".13"/>
          <path d="M9 46h46c0 5-4 9.5-9 9.5H18c-5 0-9-4.5-9-9.5z" fill="url(#vd-gBunLow)"/>
          <rect x="8" y="37.5" width="48" height="9" rx="4.5" fill="url(#vd-gPatty)"/>
          <path d="M8 36h48l-5 5.5-4-3.5-4.5 4-4-3.5-4.5 4-4-3.5-4.5 4-4-3.5-4.5 4-4.5-4.5z" fill="url(#vd-gCheese)"/>
          <path d="M6 34c3-3.4 5.4 2 8.4-1.2s5.4 2 8.4-1.2 5.4 2 8.4-1.2 5.4 2 8.4-1.2 5.4 2 8.4-1.2 4.4 2 6.4.6v3.6H6z" fill="#5cc23a"/>
          <rect x="11" y="28.5" width="19" height="4.5" rx="2.2" fill="#f0453a"/><rect x="33" y="28.5" width="20" height="4.5" rx="2.2" fill="#f0453a"/>
          <path d="M9 30c0-10 10.3-17 23-17s23 7 23 17z" fill="url(#vd-gBun)"/>
          <g fill="#fff6de"><ellipse cx="22" cy="20" rx="1.7" ry="1" transform="rotate(-25 22 20)"/><ellipse cx="30" cy="17" rx="1.7" ry="1" transform="rotate(10 30 17)"/><ellipse cx="38" cy="19" rx="1.7" ry="1" transform="rotate(30 38 19)"/><ellipse cx="45" cy="23" rx="1.6" ry="1" transform="rotate(-15 45 23)"/><ellipse cx="17" cy="25" rx="1.6" ry="1" transform="rotate(20 17 25)"/><ellipse cx="34" cy="24" rx="1.6" ry="1" transform="rotate(-30 34 24)"/></g>
          <ellipse cx="22" cy="19" rx="6" ry="2.2" fill="#fff" opacity=".3" transform="rotate(-15 22 19)"/>
        </symbol>
        <symbol id="vd-art-drumstick" viewBox="0 0 64 64">
          <ellipse cx="28" cy="58.5" rx="18" ry="2.6" fill="#000" opacity=".13"/>
          <path d="M37 25l11-11" stroke="#fff4e2" strokeWidth="7" strokeLinecap="round"/>
          <circle cx="48.5" cy="9.5" r="4.6" fill="#fff4e2" stroke="#e2d1b5" strokeWidth="1.3"/>
          <circle cx="53.5" cy="14.5" r="4.6" fill="#fff4e2" stroke="#e2d1b5" strokeWidth="1.3"/>
          <path d="M45.5 12.5l3.5-3 4 4-3 3.5z" fill="#fff4e2"/>
          <path d="M11 53c-7.5-7.5-5.5-20 4-28.5 7.5-6.8 17-8.8 23-3.4 5.4 5.4 3.2 15-4.2 22.4C25.6 52 18 60 11 53z" fill="url(#vd-gChicken)"/>
          <path d="M14 30c3-3.6 7-6 11-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".45"/>
          <g fill="#9c4e12" opacity=".35"><circle cx="22" cy="40" r="1.3"/><circle cx="29" cy="33" r="1.1"/><circle cx="18" cy="47" r="1.2"/><circle cx="27" cy="45" r="1"/></g>
        </symbol>
        <symbol id="vd-art-pizza" viewBox="0 0 64 64">
          <ellipse cx="32" cy="59.5" rx="10" ry="2.2" fill="#000" opacity=".13"/>
          <path d="M32 58 8.5 16.5c14.8-7.4 32.2-7.4 47 0z" fill="url(#vd-gCheese)"/>
          <path d="M6.5 13c16-8.6 35-8.6 51 0l-2.8 6c-14.4-7.4-31-7.4-45.4 0z" fill="url(#vd-gCrust)"/>
          <g fill="#e53935"><circle cx="29" cy="26" r="5.2"/><circle cx="39.5" cy="33.5" r="4.4"/><circle cx="28" cy="40" r="3.8"/><circle cx="38" cy="21.5" r="3"/></g>
          <g fill="#b71c1c" opacity=".55"><circle cx="27.5" cy="25" r=".9"/><circle cx="30.5" cy="27.5" r=".8"/><circle cx="39" cy="33" r=".8"/><circle cx="27.5" cy="40.5" r=".7"/></g>
          <path d="M33 46c2-3 5-3 6-1-2 2-4 2.6-6 1z" fill="#43a047"/>
          <path d="M14 18.5c5-1.8 10-2.6 15-2.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".5" fill="none"/>
        </symbol>
        <symbol id="vd-art-soup" viewBox="0 0 64 64">
          <g fill="none" stroke="#b9c7d4" strokeWidth="2.6" strokeLinecap="round" opacity=".9"><path d="M22 18c-3-3 3-5 0-9"/><path d="M32 17c-3-3 3-6 0-11"/><path d="M42 18c-3-3 3-5 0-9"/></g>
          <ellipse cx="32" cy="58.5" rx="20" ry="2.6" fill="#000" opacity=".13"/>
          <path d="M5 29h54c0 15-12 26-27 26S5 44 5 29z" fill="url(#vd-gBowl)"/>
          <ellipse cx="32" cy="29" rx="27" ry="6.5" fill="#e9f3ff"/>
          <ellipse cx="32" cy="29.6" rx="24" ry="5" fill="url(#vd-gSoup)"/>
          <g><circle cx="24" cy="29" r="2.6" fill="#c8642b"/><circle cx="37" cy="30.5" r="2.4" fill="#c8642b"/><circle cx="30" cy="27.8" r="1.2" fill="#43a047"/><circle cx="41" cy="28" r="1.1" fill="#43a047"/><circle cx="20" cy="31" r="1" fill="#43a047"/></g>
          <path d="M11 37c3 8 10 13 18 14" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".45"/>
        </symbol>
        <symbol id="vd-art-cake" viewBox="0 0 64 64">
          <ellipse cx="32" cy="58" rx="22" ry="2.6" fill="#000" opacity=".13"/>
          <path d="M25 41l31-12v17L25 58z" fill="#e9a957"/>
          <path d="M25 44l31-12v2.2L25 46.2z" fill="#fff4e6"/>
          <path d="M25 48l31-12v3.4L25 51.4z" fill="#d63b5e"/>
          <path d="M8 31l17 10v17L8 48z" fill="url(#vd-gSponge)"/>
          <path d="M8 34l17 10v2.2L8 36.2z" fill="#fff"/>
          <path d="M8 38l17 10v3.4L8 41.4z" fill="#e84a6f"/>
          <path d="M8 31l31-12 17 10-31 12z" fill="url(#vd-gCream)" stroke="#f0d9c0" strokeWidth="1"/>
          <path d="M33 21c-4 0-5.5-3.6-2.6-5.2.2-2.6 3.6-3.4 5-1.4 2.6-.8 4.6 1.8 3 3.8.6 2.2-1.8 3.4-5.4 2.8z" fill="#fff" stroke="#f0d9c0" strokeWidth=".8"/>
          <path d="M35 11.5c-3.6-.4-5.4 3.2-3.4 6.6 1.4 2.4 3 3.2 3.6 3.2s2.2-.8 3.6-3.2c2-3.4.2-7-3.8-6.6z" fill="#f0313f"/>
          <path d="M32.5 11.1l2.5 1.4 2.5-1.4-1-.9 1.2-1.3-2.7.6-.8-1.8-.8 1.8-2.7-.6 1.2 1.3z" fill="#43a047"/>
          <g fill="#ffe082"><circle cx="34" cy="15" r=".6"/><circle cx="36.5" cy="16.5" r=".6"/><circle cx="34.5" cy="18.5" r=".6"/></g>
        </symbol>
        <symbol id="vd-art-ice-cream" viewBox="0 0 64 64">
          <ellipse cx="32" cy="61" rx="8" ry="1.8" fill="#000" opacity=".13"/>
          <path d="M21 31h22L32 60z" fill="url(#vd-gCone)"/>
          <g clipPath="url(#vd-cCone)" stroke="#a8661b" strokeWidth="1.3" opacity=".6" fill="none"><path d="M18 34l20 26M24 30l20 26M30 30l20 26M46 34 26 60M40 30 20 56M34 30 14 56"/></g>
          <circle cx="32" cy="29" r="12" fill="url(#vd-gPink)"/>
          <path d="M20.5 31c1.5 3 3.5 2 4.5 0 1.2 2.6 3.6 2.6 4.6 0 1.2 2.6 3.6 2.6 4.6 0 1.2 2.4 3.4 2.6 4.6 0 1 2 3 3 4.6 0v-2H20.5z" fill="#f04e86"/>
          <circle cx="32" cy="16" r="10" fill="url(#vd-gMint)"/>
          <g><rect x="27" y="10" width="3.4" height="1.2" rx=".6" fill="#ff5a5f" transform="rotate(30 28.7 10.6)"/><rect x="34" y="12" width="3.4" height="1.2" rx=".6" fill="#ffd21f" transform="rotate(-20 35.7 12.6)"/><rect x="30" y="18" width="3.4" height="1.2" rx=".6" fill="#5b8cff" transform="rotate(60 31.7 18.6)"/><rect x="37" y="17" width="3.4" height="1.2" rx=".6" fill="#ff5a5f" transform="rotate(10 38.7 17.6)"/><rect x="25" y="16" width="3.4" height="1.2" rx=".6" fill="#ffd21f" transform="rotate(-50 26.7 16.6)"/></g>
          <ellipse cx="27.5" cy="11" rx="3.6" ry="1.9" fill="#fff" opacity=".55" transform="rotate(-25 27.5 11)"/>
          <ellipse cx="26" cy="24" rx="3.6" ry="1.9" fill="#fff" opacity=".45" transform="rotate(-25 26 24)"/>
        </symbol>
        <symbol id="vd-art-snack" viewBox="0 0 64 64">
          <ellipse cx="32" cy="61" rx="15" ry="2" fill="#000" opacity=".13"/>
          <g fill="#fff7da" stroke="#f1d27e" strokeWidth="1.2"><circle cx="20" cy="22" r="6"/><circle cx="44" cy="21" r="6"/><circle cx="28" cy="15.5" r="6.5"/><circle cx="37" cy="14.5" r="6"/><circle cx="32" cy="22" r="6"/><circle cx="24" cy="25" r="5"/><circle cx="40" cy="25.5" r="5"/></g>
          <g fill="#ffcf5a" opacity=".8"><circle cx="27" cy="14" r="1.4"/><circle cx="38" cy="13" r="1.3"/><circle cx="43" cy="19.5" r="1.2"/><circle cx="19" cy="20.5" r="1.2"/></g>
          <path d="M13 26h38l-5.2 31.6a2.4 2.4 0 0 1-2.4 2H20.6a2.4 2.4 0 0 1-2.4-2z" fill="#fff" stroke="#e2e6ea" strokeWidth="1"/>
          <path d="M18.5 26h6l2.05 33.6H22.2zM29 26h6l-.8 33.6h-4.4zM39.5 26h6l-3.7 33.6h-4.35z" fill="#ff3b30"/>
          <rect x="11" y="23.5" width="42" height="5" rx="2.5" fill="#f4f4f6" stroke="#e2e6ea"/>
        </symbol>
        <symbol id="vd-art-candy" viewBox="0 0 64 64">
          <ellipse cx="32" cy="52" rx="18" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M19 32 6 22.5v19z" fill="#b66bff"/><path d="m45 32 13-9.5v19z" fill="#b66bff"/>
          <path d="M19 32 9 27M19 32 9 37M45 32l10-5M45 32l10 5" stroke="#8e3be0" strokeWidth="1.2" opacity=".6"/>
          <ellipse cx="32" cy="32" rx="14.5" ry="11.5" fill="url(#vd-gCandy)"/>
          <g clipPath="url(#vd-cCandy)"><path d="M24 20c4 6 4 18 0 24M32 19c4 7 4 19 0 26M40 20c4 6 4 18 0 24" stroke="#fff" strokeWidth="2.4" fill="none" opacity=".5"/></g>
          <ellipse cx="27" cy="26" rx="5" ry="2.2" fill="#fff" opacity=".45" transform="rotate(-20 27 26)"/>
        </symbol>
        <symbol id="vd-art-cigarette" viewBox="0 0 64 64">
          <ellipse cx="30" cy="54" rx="20" ry="2.4" fill="#000" opacity=".12"/>
          <path d="M50 20c-3-3 2-5-1-9M55 21c-3-3 2-6-1-10" stroke="#b9c7d4" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".85"/>
          <g transform="rotate(-24 32 34)">
            <rect x="6" y="30" width="44" height="8" rx="2" fill="#fff" stroke="#d3d9df" strokeWidth="1.2"/>
            <rect x="6" y="30" width="14" height="8" rx="2" fill="#f2a13f"/>
            <g fill="#c9761f" opacity=".55"><circle cx="9.5" cy="32.5" r=".8"/><circle cx="13" cy="35" r=".8"/><circle cx="16.5" cy="32.5" r=".8"/><circle cx="11" cy="36.3" r=".6"/></g>
            <rect x="47.5" y="30" width="5.5" height="8" rx="2" fill="url(#vd-gEmber)"/>
            <rect x="51" y="30.6" width="2.6" height="6.8" rx="1.3" fill="#9e9e9e"/>
          </g>
        </symbol>
        <symbol id="vd-art-ticket" viewBox="0 0 64 64">
          <ellipse cx="32" cy="56" rx="22" ry="2.4" fill="#000" opacity=".12"/>
          <g transform="rotate(-12 32 32)">
            <path d="M7 19h50v9a4.5 4.5 0 0 0 0 9v9H7v-9a4.5 4.5 0 0 0 0-9z" fill="url(#vd-gTicket)"/>
            <path d="M42 21v24" stroke="#fff" strokeWidth="2" strokeDasharray="2.5 3" opacity=".85"/>
            <path d="M24 24.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L24 37.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="#fff"/>
            <rect x="45.5" y="26" width="7" height="2.2" rx="1.1" fill="#fff" opacity=".8"/><rect x="45.5" y="31" width="7" height="2.2" rx="1.1" fill="#fff" opacity=".8"/><rect x="45.5" y="36" width="5" height="2.2" rx="1.1" fill="#fff" opacity=".8"/>
          </g>
        </symbol>
        <symbol id="vd-art-gift" viewBox="0 0 64 64">
          <ellipse cx="32" cy="58.5" rx="21" ry="2.4" fill="#000" opacity=".13"/>
          <rect x="12" y="29" width="40" height="27" rx="3" fill="url(#vd-gRed)"/>
          <rect x="9" y="21" width="46" height="10" rx="3" fill="#ff7a6e"/>
          <rect x="29" y="21" width="6" height="35" fill="url(#vd-gGold)"/>
          <path d="M32 21c-4-8-14-9-13-3 1 4 8 4 13 3z" fill="url(#vd-gGold)"/><path d="M32 21c4-8 14-9 13-3-1 4-8 4-13 3z" fill="url(#vd-gGold)"/>
          <circle cx="32" cy="21" r="2.8" fill="#f0ac00"/>
          <rect x="12" y="23" width="14" height="2.4" rx="1.2" fill="#fff" opacity=".4"/>
        </symbol>
        <symbol id="vd-art-other" viewBox="0 0 64 64">
          <ellipse cx="32" cy="59" rx="22" ry="2.4" fill="#000" opacity=".13"/>
          <path d="M9 24l23 10v24L9 48z" fill="#d69a55"/>
          <path d="M32 34l23-10v24L32 58z" fill="#bd7e3c"/>
          <path d="M9 24l23-10 23 10-23 10z" fill="url(#vd-gBoxTop)"/>
          <path d="M19.5 19.4l23 10-3.2 1.4-23-10z" fill="#f7e2b8"/>
          <path d="M39.3 30.8v6.6l3.2-1.4v-6.6z" fill="#f7e2b8" opacity=".85"/>
          <path d="M13 34l6 2.6v5L13 39z" fill="#f4dfba" opacity=".8"/>
        </symbol>
      </defs>
    </svg>
  );
}

/** Ein Symbol aus dem Vorrat, z. B. artIcon("beer"). Größe wie gewohnt über className (size-…). */
export function artIcon(key: string) {
  function ArtIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 64 64" overflow="visible" {...props}>
        <use href={`#vd-art-${key}`} />
      </svg>
    );
  }
  ArtIcon.displayName = `ArtIcon(${key})`;
  return ArtIcon;
}
