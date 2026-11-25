# 🎸 Palheta — treino de guitarra

App instalável (PWA) para computador e celular, feito em HTML/JS puro — sem dependências nem build.

## O que ele faz

| Aba | Recursos |
|---|---|
| **Afinador** | Nota, ponteiro em cents, corda detectada automaticamente, 5 afinações (Padrão, Eb, Drop D, DADGAD, Open G), som de referência de cada corda e um detector de acordes ao vivo para testar o microfone. |
| **Tocar** | Escolha uma música → o app conta o tempo, mostra e **fala** o próximo acorde ("Ré menor"), mostra o desenho do acorde e acompanha você. No final dá uma **nota de 0 a 100** com precisão dos acordes, ritmo, estabilidade e dicas. |
| **Tablatura** | Treino de solo nota a nota a partir de uma tablatura em texto. Confere cada nota tocada, marca acertos/erros na tab e pontua acerto, ritmo e limpeza. |
| **Progresso** | Histórico de todos os treinos e estatísticas. |

### Modos de treino

- **Seguir meu ritmo** (acordes) / **Espera** (tab): o app espera *você* trocar de acorde/nota e se adapta ao seu andamento. O ritmo é avaliado em relação ao **seu próprio tempo** — não ao BPM original —, e a estabilidade mostra se você acelerou ou atrasou.
- **Metrônomo**: o clique dita o tempo; o app avalia se as palhetadas e as trocas caíram no tempo (em ms).

## Como tocar uma música sua (ex.: "Medo da Chuva")

1. Aba **Tocar** → **+ Nova música**.
2. Cole a cifra inteira (de qualquer site de cifras). O app pega só as linhas de acordes e ignora a letra. Cada acorde vale um compasso.
3. Ajuste o BPM e salve. Para mais precisão de duração, use o formato de compassos:

```
[Intro]
| G | D . C . |
[Refrão]
| Em | C | G . D . | G |
G:2 C:2 D:4        ← duração em tempos
C G Am F (2x)      ← repete a linha
```

## Rodar no computador

```powershell
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Abra `http://localhost:5173` no Chrome ou Edge e clique em **Instalar app** (ou no ícone de instalar na barra de endereço).

## Instalar no celular

O microfone só funciona em **HTTPS**, então o app precisa estar publicado num endereço seguro. Opções gratuitas: **GitHub Pages**, **Netlify** ou **Cloudflare Pages** (é só subir a pasta inteira — não tem build).

- **Android (Chrome):** abra o endereço → menu ⋮ → *Instalar app*.
- **iPhone (Safari):** abra o endereço → Compartilhar → *Adicionar à Tela de Início*.

Depois da primeira abertura, ele funciona offline.

## Como a detecção funciona

- **Notas:** algoritmo YIN (frequência fundamental) — `js/audio/yin.js`.
- **Acordes:** cromagrama (energia de cada uma das 12 notas, a partir do espectro) comparado com modelos de acordes que incluem harmônicos — `js/audio/chroma.js`.
- **Palhetadas:** subida brusca de energia, localizada dentro do buffer de áudio com precisão de ~1 ms — `js/audio/engine.js`.
- **Atraso do áudio:** compensado nos modos com metrônomo. Em *Ajustes → Calibrar automaticamente* o app toca cliques e mede o atraso real do seu aparelho.

### Limitações

- O app reconhece a **altura** das notas, não a corda: a mesma nota em outra corda conta como certa.
- Bends, slides e vibratos podem confundir a detecção no modo tablatura.
- Em ambiente barulhento, diminua a *Sensibilidade* nos ajustes. Com fone de ouvido a voz e o metrônomo não vazam no microfone.

## Testes

Com o servidor rodando, abra `http://localhost:5173/tests/` — roda os testes de teoria, cifra, tablatura, detecção de nota (YIN) e reconhecimento de acordes.

Para testar sem guitarra, `tests/fake-guitar.js` simula um guitarrista pelo console do navegador:

```js
const g = await import('/tests/fake-guitar.js'); g.install();
// inicie um treino e então:
g.chords(['G', 'C', 'D'], 1.3);   // 1,3 s por acorde
```

## Estrutura

```
index.html, css/styles.css, manifest.webmanifest, sw.js, icons/
js/audio/      microfone, YIN, cromagrama
js/music/      teoria, leitor de cifra, leitor de tablatura, desenhos de acordes
js/practice/   sessões de acordes e de tablatura, pontuação
js/services/   armazenamento, voz, metrônomo e sons
js/ui/         telas
scripts/       servidor local e gerador de ícones
tests/         testes no navegador
```
