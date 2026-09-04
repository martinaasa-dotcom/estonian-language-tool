/**
 * Where to talk to real people, which no learning app usually says.
 *
 * Every entry is a public programme, credited by name, with a link that was
 * opened before it was written down: a dead link on the one screen that
 * points out of the app would be the app saying "go" and not meaning it.
 * The descriptions are English and make no claim that needs checking beyond
 * what the site itself says on its front page.
 *
 * Pure.
 */
export interface PlaceToTalk {
  readonly name: string;
  readonly what: string;
  readonly href: string;
}

export const PLACES_TO_TALK: readonly PlaceToTalk[] = [
  {
    name: "Integratsiooni Sihtasutus, the Integration Foundation",
    what: "Runs the Estonian Language Houses in Tallinn and Narva, with language cafés, clubs and consultations where you speak Estonian with people who came to speak it with you.",
    href: "https://integratsioon.ee/en",
  },
  {
    name: "Settle in Estonia",
    what: "The state's welcome programme for people who have moved here, with free Estonian language courses run by teachers in a room with other beginners.",
    href: "https://www.settleinestonia.ee/",
  },
  {
    name: "Keeleklikk",
    what: "A free Estonian e-course from beginner upward, with a teacher who answers by email. Good beside this app, and it is where the README already points.",
    href: "https://www.keeleklikk.ee/",
  },
];
