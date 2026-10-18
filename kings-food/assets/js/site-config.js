/*
 * King's Food — business details shown on the website.
 *
 * Empty values are hidden on the page, so nothing unconfirmed is ever
 * published. Fill them in as soon as they are known.
 */
window.KF_CONFIG = {
  name: "King's Food",
  tagline: "Premium Fast Food",
  established: 2026,

  address: {
    street: "Pärnu mnt 326",
    district: "Nõmme",
    city: "Tallinn",
    country: "EE"
  },

  // e.g. "+372 5555 5555"
  phone: "",
  // e.g. "info@kingsfood.ee"
  email: "",

  // Day keys: mon tue wed thu fri sat sun. Use "closed" for a closed day.
  // e.g. { mon: ["11:00", "21:00"], ..., sun: "closed" }
  // Leave empty to show "Opening hours will be announced soon".
  hours: {},

  // Full profile URLs, e.g. "https://www.instagram.com/kingsfood"
  social: {
    instagram: "",
    facebook: "",
    tiktok: ""
  },

  // Delivery partner store links (Wolt / Bolt Food), shown when set.
  delivery: {
    wolt: "",
    bolt: ""
  }
};
