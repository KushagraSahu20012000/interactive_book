import { NavLink } from "@/components/NavLink";
import { useUiSound } from "@/audio/UiSoundProvider";
import { Volume2, VolumeX } from "lucide-react";

export const TopNav = () => {
  const { muted, toggleMuted } = useUiSound();

  return (
    <nav className="sticky top-0 z-50 grainy-yellow-surface border-b-[4px] border-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <NavLink
          to="/"
          className="flex items-center gap-2 group"
          activeClassName=""
        >
          <div className="bg-card brutal-border brutal-shadow-sm overflow-hidden group-hover:animate-wiggle">
            <img
              src="/logo-5.png"
              alt="Bright Minds logo"
              className="w-12 h-12 object-cover"
            />
          </div>
          <span className="font-display text-2xl sm:text-3xl uppercase">Bright Minds</span>
        </NavLink>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleMuted}
            data-sfx-ignore="true"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            title={muted ? "Turn sound on" : "Turn sound off"}
            className="flex items-center justify-center px-3 py-2 bg-card brutal-border brutal-shadow-sm brutal-press"
          >
            {muted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />}
          </button>
          <NavLink
            to="/"
            end
            className="font-display uppercase px-3 sm:px-4 py-2 bg-brainy-sky brutal-border brutal-shadow-sm brutal-press text-sm sm:text-base"
            activeClassName="!bg-brainy-pink text-primary-foreground"
          >
            Home
          </NavLink>
          <NavLink
            to="/books"
            className="font-display uppercase px-3 sm:px-4 py-2 bg-brainy-lime brutal-border brutal-shadow-sm brutal-press text-sm sm:text-base"
            activeClassName="!bg-brainy-pink text-primary-foreground"
          >
            Books
          </NavLink>
          <div className="flex items-center gap-1 px-3 py-2 bg-card brutal-border brutal-shadow-sm font-display text-xs sm:text-sm whitespace-nowrap">
            <span>●</span>
            <span>AI Live</span>
          </div>
        </div>
      </div>
    </nav>
  );
};
