import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Fotó kiválasztása és előkészítése feltöltéshez — egy helyen, két képernyő helyett.
 *
 * A logika eddig a CreateTicketScreen-ben élt. Amikor a jegy-részletek képernyőre is
 * kellett (a lakó utólag is tudjon képet csatolni a beszélgetésben), a másolás lett
 * volna a gyors út — de ebben a projektben már négy ilyen másolat okozott hibát, ahol a
 * javítás csak az egyik példányba került bele.
 */

/**
 * 1600 px széles, 0,8-as JPEG. Mobilneten egy nyers telefonfotó több megabájt; ez a
 * méret még olvasható marad egy hibajegyen, de nem terheli a lakó adatforgalmát.
 */
export async function compressPhoto(uri) {
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  return r.uri;
}

/**
 * Kép kérése a felhasználótól: fényképezőgép vagy galéria.
 *
 * `null`-t ad vissza, ha a felhasználó megszakítja VAGY megtagadja az engedélyt — a
 * kettőt szándékosan nem különbözteti meg a hívó felé: mindkét esetben ugyanaz a
 * teendő (nem történik semmi). Az engedélykérés elutasítását a hívó jelzi a
 * felhasználónak, mert csak ő tudja, milyen szöveggel.
 */
export async function pickAndCompress(fromCamera) {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { denied: true, uri: null };

  const res = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
  if (res.canceled) return { denied: false, uri: null };

  const uri = res.assets?.[0]?.uri;
  if (!uri) return { denied: false, uri: null };
  return { denied: false, uri: await compressPhoto(uri) };
}
