import React, { useState, useEffect } from 'react';
import { Autocomplete, TextField, Box, Typography } from '@mui/material';
import api from '../services/api';

/**
 * Beszállító-választó: emlékszik arra, kit írtál már be, és kitölti az adószámot.
 *
 * EGY KOMPONENS, KÉT ŰRLAP
 * ------------------------
 * A számla és a költség űrlapja ugyanazt a két mezőt kéri (név + adószám), és eddig
 * mindkettőn külön be kellett gépelni. Egy közös komponens azért fontos, mert amikor a
 * beszállítók átkerülnek a partner-modulba, akkor EGY helyen kell átállítani a forrást —
 * nem kettőn, ahol az egyik menthetetlenül lemarad.
 *
 * A `/vendors` végpont válasza már ma hordoz egy `contractor_id` mezőt (most null). Ha
 * majd törzsadatból jön, ez a komponens változatlan marad.
 *
 * SZABADON GÉPELHETŐ MARAD
 * ------------------------
 * `freeSolo`: egy új beszállítót be lehessen írni anélkül, hogy előbb törzsadatot kéne
 * felvenni. A javaslat segítség, nem kapu — különben az első ismeretlen számlánál
 * elakadna a rögzítés.
 */
export default function VendorAutocomplete({
  name, taxNumber, onChange, disabled = false,
  nameLabel = 'Szállító neve', taxLabel = 'Adószám',
}) {
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    api.get('/vendors', { params: { limit: 200 } })
      .then((r) => setOptions(r.data?.data?.vendors || []))
      .catch(() => setOptions([]))     // a javaslat elmaradása ne blokkolja a gépelést
      .finally(() => setLoaded(true));
  }, [loaded]);

  return (
    <>
      <Autocomplete
        freeSolo
        options={options}
        value={name || ''}
        disabled={disabled}
        sx={{ flex: 2 }}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.name || '')}
        filterOptions={(opts, state) => {
          // Ékezet- és kisbetű-független, ugyanaz a szabály, mint a szerveren.
          const needle = String(state.inputValue || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          if (!needle) return opts.slice(0, 30);
          return opts.filter((o) => String(o.name || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(needle)).slice(0, 30);
        }}
        onInputChange={(_, v, reason) => {
          // Szabad gépelésnél a törzs-kapcsolat megszűnik: a név már nem azé a partneré.
          if (reason === 'input') onChange({ vendor_name: v, vendor_contractor_id: null });
        }}
        onChange={(_, v) => {
          if (!v) { onChange({ vendor_name: '', vendor_contractor_id: null }); return; }
          if (typeof v === 'string') { onChange({ vendor_name: v, vendor_contractor_id: null }); return; }
          // Kiválasztáskor az adószám magától jön — ez az egész lényege. A
          // contractor_id-t is továbbadjuk: ez köti a tételt a partner-törzshöz, és
          // ettől lesz a beszállító egy HELYEN javítható.
          onChange({
            vendor_name: v.name,
            vendor_tax_number: v.tax_number || '',
            vendor_contractor_id: v.contractor_id || null,
          });
        }}
        renderOption={(props, o) => (
          <Box component="li" {...props} key={o.name}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>{o.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {o.tax_number || 'nincs adószám'} · {o.usage_count}× használva
                {o.contractor_id ? ' · törzsadat' : ' · még nincs partnerként rögzítve'}
              </Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField {...params} label={nameLabel} size="small"
            helperText={loaded && options.length === 0 ? 'Még nincs korábbi beszállító' : ' '} />
        )}
      />
      <TextField
        label={taxLabel} size="small" sx={{ flex: 1 }} disabled={disabled}
        value={taxNumber || ''}
        onChange={(e) => onChange({ vendor_tax_number: e.target.value })}
        placeholder="12345678-2-42"
        helperText=" "
      />
    </>
  );
}
