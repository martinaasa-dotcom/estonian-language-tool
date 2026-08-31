"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";

/**
 * A LINK THAT FETCHES THE PAGE WHEN IT LOOKS LIKE YOU ARE GOING THERE.
 *
 * Every screen in this app is `force-dynamic`, which is right: a deck, a
 * streak and a due count are facts about the person reading, and there is
 * nothing to prerender. What it costs is the thing prefetching is for. Next
 * does prefetch a link that scrolls into view, but for a dynamic route it
 * stops at the nearest `loading.tsx`: measured here, that answer is 150 bytes,
 * seven milliseconds and no database query at all. It is the skeleton. So the
 * skeleton arrives early and the page a learner is actually waiting for still
 * starts being built when they click, which is the whole of why pressing a row
 * of the rail means watching a grey rectangle for a third of a second.
 *
 * `prefetch` set to `true` fetches the page itself. Setting it on all sixteen
 * rows of the rail would render somebody's dashboard, charts and deck every
 * time any page loaded, which trades a slow rail for a slow everything. So it
 * is asked for on intent instead: a pointer that has settled on a row, or a
 * row that has taken keyboard focus. Measured in a browser against this app,
 * with a 20ms round trip simulated on every query: a cold click on Progress is
 * 458ms and a click after the pointer had rested there is 64ms.
 *
 * SETTLED, NOT MERELY CROSSED. A pointer on its way down the rail passes four
 * rows to reach the fifth, and prefetching each of them would be four renders
 * bought and thrown away. A short delay is the difference between "the pointer
 * is here" and "the pointer stopped here"; it is well under the time it takes
 * to move and press, so nothing is lost by waiting it out. Leaving cancels it.
 *
 * Once per link. `prefetch` is not un-set on the way out: the page has been
 * fetched and the router is holding it, so turning the prop back off would
 * only make the next hover fetch it again.
 *
 * TOUCH IS LEFT ALONE, AND IT IS NOT LEFT WITH NOTHING. A tap has no hover
 * before it, so an "intent" here would fire at the same moment as the
 * navigation and buy nothing. What a phone gets instead is the skeleton, from
 * the prefetch Next makes on sight, and the router cache: see `staleTimes` in
 * next.config.ts, which is what makes going back to a page free rather than a
 * fresh render of it.
 */
const SETTLED_MS = 90;

export function PrefetchLink({
  onPointerEnter, onPointerLeave, onFocus, ...rest
}: ComponentProps<typeof Link>) {
  const [wanted, setWanted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // A pointer that leaves before the delay is up was on its way somewhere
  // else, and so is a component that unmounts under it.
  useEffect(() => cancel, [cancel]);

  const settle = useCallback(() => {
    if (wanted || timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setWanted(true);
    }, SETTLED_MS);
  }, [wanted]);

  return (
    <Link
      {...rest}
      // `undefined` rather than `false` on the way in, so a link keeps the
      // prefetch Next makes on sight. That is the skeleton, which is what a
      // tap gets and what a hurried click falls back to.
      prefetch={wanted ? true : undefined}
      onPointerEnter={(event) => {
        settle();
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        cancel();
        onPointerLeave?.(event);
      }}
      onFocus={(event) => {
        // Keyboard focus is not a sweep, so there is nothing to wait out.
        setWanted(true);
        onFocus?.(event);
      }}
    />
  );
}
