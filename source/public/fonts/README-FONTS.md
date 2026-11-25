# Font packaging

This release contains no WOFF/WOFF2/TTF/OTF font binaries. The storefront uses system font stacks for Latin, Sorani Kurdish and Arabic text; the browser selects available operating-system fonts.

`INTER-LICENSE.txt` and `NOTO-LICENSE.txt` are retained historical upstream notice texts. Their presence does not mean those font binaries are bundled or establish rights to newly added font files. Earlier refresh notes about nine self-hosted WOFF2 subsets and locale preloads describe a prior build.

Before adding self-hosted fonts, record the exact source/version, license, hashes and any subsetting changes, and preserve the required notices. The current design does not request a Google Fonts or other external font CDN.
