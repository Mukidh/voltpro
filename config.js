window.VOLTPRO = {
  contactUrl:
    location.hostname === "127.0.0.1" || location.hostname === "localhost"
      ? "/api/contact"
      : "https://voltpro-ivory.vercel.app/api/contact",
};
