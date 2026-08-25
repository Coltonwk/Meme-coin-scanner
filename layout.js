export const metadata = {
  title: "Meme Coin Momentum Scanner",
  description: "Informational meme-coin momentum and risk scanner.",
  manifest: "/manifest.webmanifest",
  themeColor: "#090b10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
