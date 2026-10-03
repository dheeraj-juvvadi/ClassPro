import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'upstream'))
from services.portal_profile_service import PortalProfileService
from academic_data import extras
class SummaryTests(unittest.TestCase):
 def test_explicit_cgpa_and_earned_credits(self):
  html='<table><tr><td>Current CGPA:</td><td>8.25 / 10</td></tr><tr><td>Total Credits Earned</td><td>64.5</td></tr></table>'
  profile=PortalProfileService.parse(html)
  self.assertEqual(profile['currentCgpa'],8.25)
  self.assertEqual(profile['completedCredits'],64.5)
  self.assertEqual(extras({'profile':profile})['profile']['currentCgpa'],8.25)
 def test_never_confuse_semester_gpa_or_registered_credits(self):
  html='<table><tr><td>Semester GPA</td><td>9.9</td></tr><tr><td>Registered Credits</td><td>24</td></tr></table>'
  self.assertEqual(PortalProfileService.academic_summary(html),{})
 def test_invalid_missing_and_out_of_range(self):
  for v in ['N/A','NaN','11','-2','8.4 pending']:
   html=f'<table><tr><td>CGPA</td><td>{v}</td></tr></table>'
   self.assertNotIn('currentCgpa',PortalProfileService.academic_summary(html))
 def test_zero_is_valid(self):
  html='<table><tr><td>CGPA</td><td>0</td></tr><tr><td>Credits earned</td><td>0</td></tr></table>'
  self.assertEqual(PortalProfileService.academic_summary(html)['completedCredits'],0)
