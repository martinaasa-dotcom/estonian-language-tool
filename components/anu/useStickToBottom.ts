"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Msg } from "./useAnuChat";

/**
 * Keeps a conversation's newest line in view as it arrives.
 *
 * Anu streams, so an answer grows a token at a time under whatever is already
 * on screen. In the floating panel that is a box about two thirds of a phone
 * tall, which the second question fills: the reply was being written below the
 * fold and the learner watched a static screen while it happened, with no way
 * of knowing anything was being said until they thought to scroll. The full
 * `/tutor` page had an answer to this of its own and the panel had none, which
 * is the shape this directory exists to stop, so there is one of these and both
 * surfaces call it.
 *
 * WHAT IT WILL NOT DO IS TAKE THE PAGE BACK. Somebody reading the middle of a
 * long answer, or scrolling up to re-read yesterday's, has said where they want
 * to be, and a chat that hauls them to the bottom every few hundred
 * milliseconds is unreadable in a way no amount of correct scrolling makes up
 * for. So it follows only while the reader is already at the end, and a scroll
 * away from it stops the following until they come back.
 *
 * THE ONE THING THAT OVERRIDES THAT IS THE LEARNER'S OWN QUESTION. Pressing Ask
 * is not a page changing under somebody, it is somebody acting, and a question
 * that lands out of sight reads as a question that was not sent. So a new
 * message from them starts the following again wherever they had scrolled to,
 * which is why this takes the messages rather than an opaque signal: it has to
 * be able to tell whose turn arrived. Counted rather than read off the last
 * message, because the two messages a question adds (theirs, and the empty one
 * the answer streams into) are appended in the same tick and batch into a
 * single render where the last one is already Anu's.
 *
 * Attach the returned ref to the element the messages are drawn in, not to the
 * scroller: the panel scrolls a box and the page scrolls the document, and the
 * conversation is the one thing both have. The scroller is whichever ancestor
 * turns out to own the overflow.
 */

/**
 * How close to the end still counts as being at the end.
 *
 * Not zero. A streaming line grows by a few pixels between frames and a browser
 * rounds a fractional scroll position, so an exact test flickers between
 * following and not following on the one screen where it matters most.
 */
const AT_END = 64;

/** The ancestor that actually scrolls, or the document, which always does. */
function scrollerFor(node: HTMLElement): HTMLElement {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) return el;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function atEnd(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= AT_END;
}

export function useStickToBottom(messages: Msg[]) {
  const scroller = useRef<HTMLElement | null>(null);
  const following = useRef(true);
  const asked = useRef(0);

  /*
    A callback ref rather than an effect, because the element comes and goes.

    The panel is mounted once for the whole session and draws its conversation
    only while it is open and has something in it, so an effect with an empty
    dependency list would run at a moment when there is nothing to listen to and
    never again.
  */
  const ref = useCallback((node: HTMLElement | null) => {
    scroller.current = null;
    if (!node) return;
    const el = scrollerFor(node);
    scroller.current = el;
    following.current = true;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const toEnd = () => { if (following.current) el.scrollTop = el.scrollHeight; };
    const onScroll = () => { following.current = atEnd(el); };
    el.addEventListener("scroll", onScroll, { passive: true });

    /*
      Watched rather than only driven off the messages, because the last thing
      to change height is not the last message to arrive. Measured in a browser,
      an answer settled 42 pixels short of the bottom every time: the caret that
      marks a live reply is removed when the stream ends, the line naming who
      answered replaces the line naming who would be asked, and both land after
      the final chunk has already been scrolled to. Anything that changes the
      shape of the conversation is followed now, including the ones nobody has
      thought of, which is what a measurement rather than a list buys.
    */
    const observer = new ResizeObserver(toEnd);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);

    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [messages]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const questions = messages.reduce((n, m) => (m.role === "user" ? n + 1 : n), 0);
    if (questions > asked.current) following.current = true;
    asked.current = questions;
    if (following.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return ref;
}
