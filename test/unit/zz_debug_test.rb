require_relative '../test_helper'
class ZzDebugTest < ActiveSupport::TestCase
  def test_debug
    m = Redmine::Acts::Mentionable::InstanceMethods
    puts "DBG mail=#{(MailHandler < RedmineCkeditor::MailHandlerPatch).inspect} qh=#{(QueriesHelper < RedmineCkeditor::QueriesHelperPatch).inspect} mentionable=#{(m < RedmineCkeditor::MentionablePatch).inspect} anc=#{m.ancestors.inspect}"
    puts "DBG loaded_from=#{$LOADED_FEATURES.grep(/mentionable|redmine_ckeditor.rb/).inspect}"
  end
end
