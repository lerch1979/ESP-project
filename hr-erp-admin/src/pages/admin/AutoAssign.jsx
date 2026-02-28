import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Rule as RuleIcon,
  Psychology as PsychologyIcon,
  Assessment as AssessmentIcon,
  BugReport as BugReportIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';

import AssignmentRules from '../AssignmentRules';
import UserSkills from '../UserSkills';
import UserWorkload from '../UserWorkload';
import AutoAssignSimulator from '../AutoAssignSimulator';
import SLAPolicies from '../SLAPolicies';

function TabPanel({ children, value, index }) {
  if (value !== index) return null;
  return <Box sx={{ mt: 2 }}>{children}</Box>;
}

const tabs = [
  { label: 'Kiosztási szabályok', icon: <RuleIcon /> },
  { label: 'Felhasználói képességek', icon: <PsychologyIcon /> },
  { label: 'Munkaterhelés', icon: <AssessmentIcon /> },
  { label: 'Teszt & Debug', icon: <BugReportIcon /> },
  { label: 'SLA szabályok', icon: <TimerIcon /> },
];

export default function AutoAssign() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = parseInt(searchParams.get('tab') || '0', 10);
  const tab = currentTab >= 0 && currentTab <= 4 ? currentTab : 0;

  const handleTabChange = (_, newValue) => {
    setSearchParams({ tab: newValue });
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        Automatikus kiosztás
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Szabályok, képességek, munkaterhelés és SLA kezelése
      </Typography>

      <Tabs
        value={tab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
        }}
      >
        {tabs.map((t, i) => (
          <Tab key={i} icon={t.icon} iconPosition="start" label={t.label} />
        ))}
      </Tabs>

      <TabPanel value={tab} index={0}><AssignmentRules /></TabPanel>
      <TabPanel value={tab} index={1}><UserSkills /></TabPanel>
      <TabPanel value={tab} index={2}><UserWorkload /></TabPanel>
      <TabPanel value={tab} index={3}><AutoAssignSimulator /></TabPanel>
      <TabPanel value={tab} index={4}><SLAPolicies /></TabPanel>
    </Box>
  );
}
