require_relative '../test_helper'
class ZzDebugTest < ActiveSupport::TestCase
  def test_debug
    m = Redmine::Acts::Mentionable::InstanceMethods
    puts "DBG ruby=#{RUBY_VERSION} patchdefined=#{defined?(RedmineCkeditor::MentionablePatch).inspect} apply=#{RedmineCkeditor.method(:apply_patch).source_location.inspect}"
    puts "DBG before=#{m.ancestors.map(&:to_s).inspect}"
    RedmineCkeditor.apply_patch
    puts "DBG after=#{m.ancestors.map(&:to_s).inspect} issue_idx=#{Issue.ancestors.map(&:to_s).first(5).inspect}"
    puts "DBG owner=#{Issue.new.method(:scan_for_mentioned_users).owner}"
  end
end
