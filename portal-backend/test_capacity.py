import unittest
from unittest.mock import patch
from capacity import can_admit


class CapacityTests(unittest.TestCase):
    def test_reserve_boundary_and_nonlinux_fallback(self):
        with patch('capacity.memory_available', return_value=96 * 1024 * 1024):
            self.assertTrue(can_admit(96))
        with patch('capacity.memory_available', return_value=96 * 1024 * 1024 - 1):
            self.assertFalse(can_admit(96))
        with patch('capacity.memory_available', return_value=None):
            self.assertTrue(can_admit(96))
