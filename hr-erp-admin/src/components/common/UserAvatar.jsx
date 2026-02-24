import React from 'react';
import { Avatar, Tooltip } from '@mui/material';

const AVATAR_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#f97316', // orange
  '#84cc16', // lime
  '#7c3aed', // violet
  '#06b6d4', // cyan
];

const SIZES = {
  xs: { width: 28, height: 28, fontSize: '0.7rem' },
  small: { width: 32, height: 32, fontSize: '0.8rem' },
  medium: { width: 40, height: 40, fontSize: '0.95rem' },
  large: { width: 64, height: 64, fontSize: '1.5rem' },
  xl: { width: 100, height: 100, fontSize: '2.2rem' },
  xxl: { width: 150, height: 150, fontSize: '3rem' },
};

export function getColorFromString(str) {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name, firstName, lastName) {
  if (firstName || lastName) {
    const f = (firstName || '')[0] || '';
    const l = (lastName || '')[0] || '';
    return (f + l).toUpperCase();
  }
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function UserAvatar({
  user,
  name,
  firstName,
  lastName,
  email,
  photoUrl,
  size = 'medium',
  tooltip = true,
  sx = {},
  children,
  ...rest
}) {
  // Extract from user object or direct props
  const _firstName = firstName || user?.firstName || user?.first_name || '';
  const _lastName = lastName || user?.lastName || user?.last_name || '';
  const _name = name || user?.name || `${_firstName} ${_lastName}`.trim();
  const _email = email || user?.email || '';
  const _photo = photoUrl || user?.photoUrl || user?.photo_url || user?.profile_photo_url || null;

  const initials = children || getInitials(_name, _firstName, _lastName);
  const color = getColorFromString(_email || _name);
  const sizeStyles = typeof size === 'string' ? (SIZES[size] || SIZES.medium) : { width: size, height: size, fontSize: size * 0.38 };

  const avatarEl = (
    <Avatar
      src={_photo || undefined}
      alt={_name}
      sx={{
        ...sizeStyles,
        bgcolor: _photo ? undefined : color,
        color: 'white',
        fontWeight: 700,
        ...sx,
      }}
      {...rest}
    >
      {!_photo && initials}
    </Avatar>
  );

  if (tooltip && _name) {
    return (
      <Tooltip title={_name} arrow>
        {avatarEl}
      </Tooltip>
    );
  }

  return avatarEl;
}

export default UserAvatar;
