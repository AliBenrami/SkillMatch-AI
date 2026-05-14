const mockedCss = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("mocked-inter-font.woff2") format("woff2");
}
`;

module.exports = new Proxy(
  {},
  {
    get: () => mockedCss
  }
);
