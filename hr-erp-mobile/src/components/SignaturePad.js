import React, { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../constants/colors';

/**
 * Aláírás-vászon a lakó telefonjára.
 *
 * MIÉRT SVG ÉS NEM PNG: a PNG-hez `react-native-view-shot` kellene — új NATÍV
 * függőség, ami új buildet és új kockázatot jelent. A `react-native-svg` viszont már
 * benne van a projektben, és a vonásokat pontosan rögzíti. A Chrome az SVG data-URL-t
 * `<img>`-ben ugyanúgy megjeleníti a PDF-ben — ezt a renderelt PDF-en ellenőriztem,
 * nem feltételeztem.
 *
 * Ráadásul az SVG VEKTOR: a nagyítás nem mossa el, és a vonások pontjai megmaradnak —
 * bizonyítékként ez több, mint egy raszteres kép.
 */
export default function SignaturePad({ onChange, height = 180 }) {
  const [vonasok, setVonasok] = useState([]);   // kész vonások (d-sztringek)
  const [aktualis, setAktualis] = useState('');  // amit épp húz
  const meret = useRef({ w: 0, h: height });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setAktualis(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setAktualis((d) => `${d} L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
      },
      onPanResponderRelease: () => {
        setAktualis((d) => {
          if (d) setVonasok((v) => [...v, d]);
          return '';
        });
      },
    })
  ).current;

  // A szülő minden változásnál megkapja a kész SVG data-URL-t — így a "Mentés"
  // gombnak nem kell a vászon belsejébe nyúlnia.
  React.useEffect(() => {
    if (!onChange) return;
    if (vonasok.length === 0) { onChange(null); return; }
    const { w, h } = meret.current;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w || 300} ${h}">`
      + vonasok.map((d) => `<path d="${d}" stroke="#111" stroke-width="2.4" fill="none" `
        + 'stroke-linecap="round" stroke-linejoin="round"/>').join('')
      + '</svg>';
    // A base64 a `global.btoa` hiánya miatt Buffer-rel megy — az Expo alatt elérhető.
    const b64 = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, 'utf8').toString('base64');
    onChange(`data:image/svg+xml;base64,${b64}`);
  }, [vonasok, onChange]);

  const torol = () => { setVonasok([]); setAktualis(''); };
  SignaturePad.torol = torol;   // a szülő ezen keresztül üríti

  return (
    <View
      style={[styles.doboz, { height }]}
      onLayout={(e) => { meret.current = {
        w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
      {...pan.panHandlers}
    >
      <Svg width="100%" height="100%">
        {vonasok.map((d, i) => (
          <Path key={i} d={d} stroke="#111" strokeWidth={2.4} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {aktualis ? (
          <Path d={aktualis} stroke="#111" strokeWidth={2.4} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  doboz: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
    borderRadius: 10, backgroundColor: colors.white, overflow: 'hidden',
  },
});
