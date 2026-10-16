require_relative '../test_helper'
class ZzDebugTest < ActiveSupport::TestCase
  def test_debug
    m = Redmine::Acts::Mentionable::InstanceMethods
    puts "DBG enabled-with-setting=#{with_settings(text_formatting: 'CKEditor') { RedmineCkeditor.enabled? }}"
    puts "DBG module<patch=#{m < RedmineCkeditor::MentionablePatch} ancestors=#{Issue.ancestors.first(6).inspect} idx=#{Issue.ancestors.index(RedmineCkeditor::MentionablePatch).inspect} mod_anc=#{m.ancestors.inspect}"
    puts "DBG owner=#{Issue.new.method(:scan_for_mentioned_users).owner}"
  end
end
