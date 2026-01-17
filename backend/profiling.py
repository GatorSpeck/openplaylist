import cProfile
import pstats
import io
import os
import functools
import logging
from datetime import datetime
from typing import Optional, Dict, Any

# Directory to store profiling reports
PROFILE_DIR = os.path.join(os.getcwd(), "profiles")
os.makedirs(PROFILE_DIR, exist_ok=True)

logger = logging.getLogger(__name__)

class ProfileManager:
    """Manages profiling reports and statistics"""
    
    def __init__(self):
        self.reports: Dict[str, Dict[str, Any]] = {}
    
    def save_report(self, profile_name: str, stats: pstats.Stats, function_name: str):
        """Save profiling report to file and memory"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{profile_name}_{timestamp}.prof"
        filepath = os.path.join(PROFILE_DIR, filename)
        
        # Save raw profile data
        stats.dump_stats(filepath)
        
        # Generate text report
        text_report = self._generate_text_report(stats)
        text_filepath = filepath.replace('.prof', '.txt')
        with open(text_filepath, 'w') as f:
            f.write(text_report)
        
        # Store in memory for API access
        self.reports[profile_name] = {
            'timestamp': timestamp,
            'function_name': function_name,
            'filepath': filepath,
            'text_filepath': text_filepath,
            'text_report': text_report,
            'stats': self._extract_stats_summary(stats)
        }
        
        logger.info(f"Profile report saved: {text_filepath}")
    
    def _generate_text_report(self, stats: pstats.Stats) -> str:
        """Generate a human-readable text report"""
        output = io.StringIO()
        
        # Sort by cumulative time and print top functions
        stats.sort_stats('cumulative')
        
        output.write("=" * 80 + "\n")
        output.write("PROFILING REPORT\n")
        output.write("=" * 80 + "\n")
        output.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        output.write(f"Total calls: {stats.total_calls}\n")
        output.write(f"Total time: {stats.total_tt:.4f} seconds\n\n")
        
        # Try multiple approaches to get the stats data
        try:
            # Method 1: Try using print_stats with stream parameter (newer versions)
            temp_stream = io.StringIO()
            try:
                stats.stream = temp_stream
                stats.print_stats(50)
                stats_content = temp_stream.getvalue()
                if stats_content.strip():
                    output.write("TOP FUNCTIONS BY CUMULATIVE TIME:\n")
                    output.write("-" * 50 + "\n")
                    output.write(stats_content)
            except Exception:
                # Method 2: Fallback to stdout redirection
                import sys
                old_stdout = sys.stdout
                try:
                    sys.stdout = output
                    output.write("TOP FUNCTIONS BY CUMULATIVE TIME:\n")
                    output.write("-" * 50 + "\n")
                    stats.print_stats(50)
                finally:
                    sys.stdout = old_stdout
            
            # Add callers information
            output.write("\n" + "=" * 80 + "\n")
            output.write("TOP CALLERS\n")
            output.write("=" * 80 + "\n")
            
            try:
                temp_stream = io.StringIO()
                stats.stream = temp_stream
                stats.print_callers(20)
                callers_content = temp_stream.getvalue()
                if callers_content.strip():
                    output.write(callers_content)
            except Exception:
                # Fallback for callers
                import sys
                old_stdout = sys.stdout
                try:
                    sys.stdout = output
                    stats.print_callers(20)
                finally:
                    sys.stdout = old_stdout
                    
        except Exception as e:
            output.write(f"Error generating detailed stats: {e}\n")
            # Add basic manual stats extraction
            try:
                stats_dict = getattr(stats, 'stats', {})
                if stats_dict:
                    output.write("\nMANUAL STATS EXTRACTION:\n")
                    output.write("-" * 30 + "\n")
                    for i, (func, stat_data) in enumerate(stats_dict.items()):
                        if i >= 20:  # Top 20
                            break
                        filename, line, function_name = func
                        if len(stat_data) >= 4:
                            cc, nc, tt, ct = stat_data[:4]
                            output.write(f"{filename}:{line}({function_name})\n")
                            output.write(f"  Calls: {cc}, Time: {tt:.4f}s, Cumulative: {ct:.4f}s\n")
            except Exception as e2:
                output.write(f"Error in manual extraction: {e2}\n")
        
        return output.getvalue()
    
    def _extract_stats_summary(self, stats: pstats.Stats) -> Dict[str, Any]:
        """Extract key statistics for API response"""
        total_calls = stats.total_calls
        total_time = stats.total_tt
        
        # Get top 10 functions by cumulative time
        stats.sort_stats('cumulative')
        top_functions = []
        
        # Use get_stats_profile() method to safely extract statistics
        try:
            # Try to get the internal stats dictionary
            stats_dict = getattr(stats, 'stats', {})
            
            # Get top functions sorted by cumulative time
            for i, (func, stat_tuple) in enumerate(stats_dict.items()):
                if i >= 10:  # Only get top 10
                    break
                    
                try:
                    # Handle both 4-tuple and 5-tuple formats
                    if len(stat_tuple) >= 4:
                        cc, nc, tt, ct = stat_tuple[:4]
                        filename, line, function_name = func
                        top_functions.append({
                            'function': f"{filename}:{line}({function_name})",
                            'calls': cc,
                            'total_time': round(tt, 4),
                            'cumulative_time': round(ct, 4),
                            'per_call': round(tt/cc if cc > 0 else 0, 4)
                        })
                except (ValueError, TypeError, IndexError) as e:
                    # Skip malformed entries
                    logger.warning(f"Skipping malformed stats entry: {func}, {stat_tuple}: {e}")
                    continue
        except Exception as e:
            logger.warning(f"Could not extract detailed stats: {e}")
            # Return basic summary without top functions
            return {
                'total_calls': total_calls,
                'total_time': round(total_time, 4),
                'top_functions': []
            }
        
        return {
            'total_calls': total_calls,
            'total_time': round(total_time, 4),
            'top_functions': top_functions
        }
    
    def get_report(self, profile_name: str) -> Optional[Dict[str, Any]]:
        """Get a specific profiling report"""
        return self.reports.get(profile_name)
    
    def get_all_reports(self) -> Dict[str, Dict[str, Any]]:
        """Get all profiling reports"""
        return self.reports
    
    def get_latest_report(self) -> Optional[Dict[str, Any]]:
        """Get the most recent profiling report"""
        if not self.reports:
            return None
        
        latest = max(self.reports.items(), key=lambda x: x[1]['timestamp'])
        return {
            'name': latest[0],
            'report': latest[1]
        }

# Global profile manager instance
profile_manager = ProfileManager()

def profile_function(profile_name: Optional[str] = None):
    """Decorator to profile a function"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            nonlocal profile_name
            actual_profile_name = profile_name if profile_name is not None else func.__name__
            
            # Create profiler
            profiler = cProfile.Profile()
            
            try:
                logger.info(f"Starting profiling for function: {func.__name__}")
                
                # Start profiling
                profiler.enable()
                result = func(*args, **kwargs)
                profiler.disable()
                
                logger.info(f"Profiling completed for function: {func.__name__}")
                
                # Generate statistics
                stats = pstats.Stats(profiler)
                
                # Save the report
                profile_manager.save_report(actual_profile_name, stats, func.__name__)
                
                logger.info(f"Profile report saved for: {actual_profile_name}")
                
                return result
                
            except Exception as e:
                profiler.disable()
                logger.error(f"Error during profiled execution of {func.__name__}: {e}")
                raise
        
        return wrapper
    return decorator

def get_profile_manager() -> ProfileManager:
    """Get the global profile manager instance"""
    return profile_manager