import React from 'react';

interface HoverSwapSlotProps {
  /** The row's quiet trailing values (an orb, a count, a percentage). Give them
   *  fixed widths so they line up down a list. They fade out on hover. */
  rest?: React.ReactNode;
  /** Slide in from the row's right edge, across `rest`, while the enclosing
   *  `group/swap` row is hovered. Not bound to `rest`'s width. */
  actions: React.ReactNode;
  /** Keep `actions` shown without hover, e.g. while one of their menus is open. */
  revealed?: boolean;
}

/**
 * The trailing end of a sidebar row: quiet values at rest, the row's actions on
 * hover. The actions are an overlay, so they never reserve space and nothing to
 * their left moves when they appear. The row must carry the `group/swap` class.
 */
export function HoverSwapSlot({ rest, actions, revealed = false }: HoverSwapSlotProps) {
  return (
    <div className="relative flex items-center justify-end shrink-0">
      <div
        className={`flex items-center transition-opacity duration-200 ease-out ${
          revealed ? 'opacity-0' : 'opacity-100 group-hover/swap:opacity-0'
        }`}
      >
        {rest}
      </div>
      {/* The clip box sits at the row's right edge; the actions slide their
          full width in from behind it, like a drawer. */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center overflow-hidden ${
          revealed ? '' : 'pointer-events-none group-hover/swap:pointer-events-auto'
        }`}
      >
        <div
          className={`flex items-center gap-0.5 transition-[opacity,translate] duration-200 ease-out ${
            revealed
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-full group-hover/swap:opacity-100 group-hover/swap:translate-x-0'
          }`}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
